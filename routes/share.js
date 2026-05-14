import { Router } from 'express';
import { db } from '../db/index.js';

export const shareRouter = Router();

// Client accesses their gallery via a share token
shareRouter.get('/:token', async (req, res) => {
  const { rows } = await db.query(
    `SELECT st.*, g.id AS gallery_id, g.title, g.description, g.client_name, g.is_published
     FROM share_tokens st
     JOIN galleries g ON g.id = st.gallery_id
     WHERE st.token = $1`,
    [req.params.token]
  );

  const row = rows[0];
  if (!row) return res.status(404).json({ error: 'Link not found' });
  if (!row.is_published) return res.status(403).json({ error: 'Gallery not yet published' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: 'Link expired' });
  }

  // Record view
  await db.query(
    `UPDATE share_tokens SET view_count = view_count + 1, last_viewed_at = NOW() WHERE token = $1`,
    [req.params.token]
  );

  // Get videos (only ready ones)
  const { rows: videos } = await db.query(
    `SELECT id, title, description, hls_path, thumbnail_path, duration_secs, sort_order
     FROM videos
     WHERE gallery_id = $1 AND status = 'ready'
     ORDER BY sort_order, created_at`,
    [row.gallery_id]
  );

  const videoResults = videos.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    duration_secs: video.duration_secs,
    sort_order: video.sort_order,
    hls_url: video.hls_path ? `/hls/${video.hls_path}` : null,
    thumbnail_url: video.thumbnail_path ? `/thumbnails/${video.thumbnail_path}` : null,
  }));

  res.json({
    gallery: {
      id: row.gallery_id,
      title: row.title,
      description: row.description,
      client_name: row.client_name,
    },
    videos: videoResults,
  });
});
