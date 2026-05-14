import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { galleriesRouter } from './routes/galleries.js';
import { videosRouter } from './routes/videos.js';
import { authRouter } from './routes/auth.js';
import { shareRouter } from './routes/share.js';
import { adminRouter } from './routes/admin.js';
import { requireAuth } from './middleware/auth.js';

const app = express();
app.use(cors());
app.use(express.json());

// Public routes
app.use('/auth', authRouter);
app.use('/share', shareRouter);       // client portal accesses via share token

// Admin-protected routes
app.use('/admin', requireAuth, adminRouter);
app.use('/galleries', requireAuth, galleriesRouter);
app.use('/videos', requireAuth, videosRouter);

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on :${PORT}`));
