/**
 * Transcode Worker
 * Polls the transcode_jobs table for queued jobs and processes them
 * using FFmpeg to produce HLS streams + auto-thumbnails.
 *
 * Requires: ffmpeg and ffprobe installed in the container.
 */

import 'dotenv/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { db } from './db/index.js';

const exec = promisify(execFile);
const POLL_INTERVAL = 5000; // ms
const HLS_DIR    = process.env.HLS_DIR    || '/data/hls';
const THUMB_DIR  = process.env.THUMB_DIR  || '/data/thumbnails';

async function claimJob() {
  // Atomically claim one queued job
  const { rows } = await db.query(`
    UPDATE transcode_jobs
    SET status = 'running', attempts = attempts + 1, updated_at = NOW()
    WHERE id = (
      SELECT id FROM transcode_jobs
      WHERE status = 'queued' AND attempts < 3
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);
  return rows[0] || null;
}

async function getVideo(videoId) {
  const { rows } = await db.query('SELECT * FROM videos WHERE id = $1', [videoId]);
  return rows[0];
}

async function processJob(job) {
  const video = await getVideo(job.video_id);
  if (!video) throw new Error('Video not found: ' + job.video_id);

  const originalFile = path.join(process.env.UPLOAD_DIR || '/data/uploads', video.original_file);
  const hlsDir   = path.join(HLS_DIR, video.gallery_id, video.id);
  const thumbDir = path.join(THUMB_DIR, video.gallery_id);
  await fs.mkdir(hlsDir, { recursive: true });
  await fs.mkdir(thumbDir, { recursive: true });

  const masterPlaylist = path.join(hlsDir, 'master.m3u8');
  const thumbPath      = path.join(thumbDir, video.id + '.jpg');

  // --- Get duration ---
  let durationSecs = null;
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      originalFile
    ]);
    durationSecs = Math.round(parseFloat(stdout.trim()));
  } catch (e) {
    console.warn('Could not get duration:', e.message);
  }

  // --- Auto-thumbnail at 10% of duration ---
  const thumbAt = durationSecs ? Math.floor(durationSecs * 0.1) : 5;
  try {
    await exec('ffmpeg', [
      '-ss', String(thumbAt),
      '-i', originalFile,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      thumbPath
    ]);
  } catch (e) {
    console.warn('Thumbnail failed:', e.message);
  }

  // --- Transcode to HLS (adaptive 3-rung ladder) ---
  // 1080p / 720p / 480p — ffmpeg will skip rungs the source doesn't support
  await exec('ffmpeg', [
    '-i', originalFile,
    // 1080p rung
    '-filter_complex',
    '[0:v]split=3[v1][v2][v3];' +
    '[v1]scale=-2:1080[v1out];' +
    '[v2]scale=-2:720[v2out];' +
    '[v3]scale=-2:480[v3out]',

    '-map', '[v1out]', '-map', '0:a?', '-c:v:0', 'libx264', '-crf', '22', '-preset', 'veryfast',
      '-c:a:0', 'aac', '-b:a:0', '192k', '-hls_time', '6', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(hlsDir, '1080p_%03d.ts'),
      path.join(hlsDir, '1080p.m3u8'),

    '-map', '[v2out]', '-map', '0:a?', '-c:v:1', 'libx264', '-crf', '23', '-preset', 'veryfast',
      '-c:a:1', 'aac', '-b:a:1', '128k', '-hls_time', '6', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(hlsDir, '720p_%03d.ts'),
      path.join(hlsDir, '720p.m3u8'),

    '-map', '[v3out]', '-map', '0:a?', '-c:v:2', 'libx264', '-crf', '24', '-preset', 'veryfast',
      '-c:a:2', 'aac', '-b:a:2', '96k', '-hls_time', '6', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', path.join(hlsDir, '480p_%03d.ts'),
      path.join(hlsDir, '480p.m3u8'),
  ]);

  // Write HLS master playlist
  const master = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080
1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480
480p.m3u8
`;
  await fs.writeFile(masterPlaylist, master);

  // Relative paths stored in DB (nginx serves them from /hls/)
  const relHls   = path.join(video.gallery_id, video.id, 'master.m3u8');
  const relThumb = video.thumbnail_path || path.join(video.gallery_id, video.id + '.jpg');

  await db.query(
    `UPDATE videos SET status = 'ready', hls_path = $1, thumbnail_path = $2,
     duration_secs = $3, updated_at = NOW() WHERE id = $4`,
    [relHls, relThumb, durationSecs, video.id]
  );
}

async function poll() {
  const job = await claimJob();
  if (!job) return;

  console.log(`Processing job ${job.id} for video ${job.video_id}`);
  try {
    await processJob(job);
    await db.query(
      `UPDATE transcode_jobs SET status = 'done', updated_at = NOW() WHERE id = $1`,
      [job.id]
    );
    console.log(`Job ${job.id} completed.`);
  } catch (err) {
    console.error(`Job ${job.id} failed:`, err.message);
    const newStatus = job.attempts >= 3 ? 'error' : 'queued';
    await db.query(
      `UPDATE transcode_jobs SET status = $1, error_msg = $2, updated_at = NOW() WHERE id = $3`,
      [newStatus, err.message, job.id]
    );
    await db.query(
      `UPDATE videos SET status = 'error' WHERE id = $1`,
      [job.video_id]
    );
  }
}

console.log('Transcode worker started, polling every', POLL_INTERVAL, 'ms');
setInterval(poll, POLL_INTERVAL);
poll(); // run immediately on start
