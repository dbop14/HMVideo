import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db/index.js';

const UPLOAD_DIR  = process.env.UPLOAD_DIR  || '/data/uploads';
const THUMB_DIR   = process.env.THUMB_DIR   || '/data/thumbnails';

const videoStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.params.galleryId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, safe);
  },
});

const thumbStorage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const dir = path.join(THUMB_DIR, req.params.galleryId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, req.params.videoId + path.extname(file.originalname)),
});

const uploadVideo = multer({ storage: videoStorage });
const uploadThumb = multer({ storage: thumbStorage, limits: { fileSize: 10 * 1024 * 1024 } });

export const videosRouter = Router();

// Upload new video to a gallery
videosRouter.post('/gallery/:galleryId', uploadVideo.single('video'), async (req, res) => {
  const { galleryId } = req.params;
  const { title, description } = req.body;

  const relativeOriginal = path.relative(UPLOAD_DIR, req.file.path);

  // Insert video record
  const { rows } = await db.query(
    `INSERT INTO videos (gallery_id, title, description, original_file)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [galleryId, title || req.file.originalname, description || null, relativeOriginal]
  );
  const video = rows[0];

  // Enqueue transcode job
  await db.query(
    `INSERT INTO transcode_jobs (video_id) VALUES ($1)`,
    [video.id]
  );

  res.status(201).json(video);
});

// Update video metadata
videosRouter.patch('/:videoId', async (req, res) => {
  const allowed = ['title', 'description', 'sort_order'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const sets = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const vals = updates.map(([, v]) => v);

  const { rows } = await db.query(
    `UPDATE videos SET ${sets} WHERE id = $1 RETURNING *`,
    [req.params.videoId, ...vals]
  );
  res.json(rows[0]);
});

// Upload custom thumbnail for a video
videosRouter.post('/:videoId/thumbnail/gallery/:galleryId',
  uploadThumb.single('thumbnail'),
  async (req, res) => {
    const relativeThumb = path.relative(THUMB_DIR, req.file.path);
    const { rows } = await db.query(
      `UPDATE videos SET thumbnail_path = $1 WHERE id = $2 RETURNING *`,
      [relativeThumb, req.params.videoId]
    );
    res.json(rows[0]);
  }
);

// Delete a video
videosRouter.delete('/:videoId', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM videos WHERE id = $1`, [req.params.videoId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const originalPath = path.join(UPLOAD_DIR, rows[0].original_file);
  const thumbnailPath = rows[0].thumbnail_path ? path.join(THUMB_DIR, rows[0].thumbnail_path) : null;

  // Clean up files (non-fatal if missing)
  try { await fs.unlink(originalPath); } catch {}
  if (thumbnailPath) { try { await fs.unlink(thumbnailPath); } catch {} }

  await db.query('DELETE FROM videos WHERE id = $1', [req.params.videoId]);
  res.status(204).end();
});
