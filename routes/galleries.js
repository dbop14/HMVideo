import { Router } from 'express';
import { db } from '../db/index.js';

export const galleriesRouter = Router();

// List all galleries
galleriesRouter.get('/', async (req, res) => {
  const { rows } = await db.query(`
    SELECT g.*, COUNT(v.id)::int AS video_count
    FROM galleries g
    LEFT JOIN videos v ON v.gallery_id = g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);
  res.json(rows);
});

// Get single gallery with videos and share tokens
galleriesRouter.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM galleries WHERE id = $1`, [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  const { rows: videos } = await db.query(
    `SELECT * FROM videos WHERE gallery_id = $1 ORDER BY sort_order, created_at`,
    [req.params.id]
  );

  const { rows: tokens } = await db.query(
    `SELECT * FROM share_tokens WHERE gallery_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );

  res.json({ ...rows[0], videos, share_tokens: tokens });
});

// Create gallery
galleriesRouter.post('/', async (req, res) => {
  const { title, client_name, description } = req.body;
  // Auto-generate a URL-safe slug
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).slice(2, 7);

  const { rows } = await db.query(
    `INSERT INTO galleries (title, client_name, description, slug)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [title, client_name, description, slug]
  );
  res.status(201).json(rows[0]);
});

// Update gallery
galleriesRouter.patch('/:id', async (req, res) => {
  const allowed = ['title', 'client_name', 'description', 'is_published', 'cover_video_id'];
  const updates = Object.entries(req.body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'No valid fields' });

  const sets = updates.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  const vals = updates.map(([, v]) => v);

  const { rows } = await db.query(
    `UPDATE galleries SET ${sets} WHERE id = $1 RETURNING *`,
    [req.params.id, ...vals]
  );
  res.json(rows[0]);
});

// Delete gallery
galleriesRouter.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM galleries WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

// Generate share token for a gallery
galleriesRouter.post('/:id/tokens', async (req, res) => {
  const { label, expires_at } = req.body;
  const { rows } = await db.query(
    `INSERT INTO share_tokens (gallery_id, label, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, label, expires_at || null]
  );
  res.status(201).json(rows[0]);
});

// List share tokens for a gallery
galleriesRouter.get('/:id/tokens', async (req, res) => {
  const { rows } = await db.query(
    `SELECT * FROM share_tokens WHERE gallery_id = $1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

// Delete a share token
galleriesRouter.delete('/:id/tokens/:tokenId', async (req, res) => {
  await db.query('DELETE FROM share_tokens WHERE id = $1', [req.params.tokenId]);
  res.status(204).end();
});
