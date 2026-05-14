import { Router } from 'express';
import { db } from '../db/index.js';

export const adminRouter = Router();

adminRouter.get('/stats', async (req, res) => {
  const { rows } = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM galleries) AS galleries,
      (SELECT COUNT(*) FROM videos) AS videos,
      (SELECT COUNT(*) FROM videos WHERE status = 'pending') AS pending_videos,
      (SELECT COUNT(*) FROM videos WHERE status = 'processing') AS processing_videos,
      (SELECT COUNT(*) FROM videos WHERE status = 'ready') AS ready_videos,
      (SELECT COUNT(*) FROM transcode_jobs WHERE status = 'queued') AS queued_jobs,
      (SELECT COUNT(*) FROM transcode_jobs WHERE status = 'running') AS running_jobs,
      (SELECT COUNT(*) FROM transcode_jobs WHERE status = 'error') AS failed_jobs
  `);

  res.json(rows[0]);
});
