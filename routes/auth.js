import { Router } from 'express';
import jwt from 'jsonwebtoken';

export const authRouter = Router();

// Simple single-admin password auth
// In production you could store a hashed password in DB or env
authRouter.post('/login', async (req, res) => {
  const { password } = req.body;
  const valid = password === process.env.ADMIN_PASSWORD;
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});
