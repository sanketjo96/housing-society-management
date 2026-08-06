import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { adminUsersRouter } from './routes/admin-users.route';
import { authRouter } from './routes/auth.route';
import { flatsRouter } from './routes/flats.route';
import { meRouter } from './routes/me.route';
import { passwordResetRouter } from './routes/password-reset.route';

export const app = express();

// Only matters for local dev, where the Vite dev server (5173) and the backend
// (3000) run as genuinely different origins. In Docker/production, nginx serves both
// under one origin (Task 0.5), so the browser never even applies CORS restrictions to
// same-origin requests — this middleware is a no-op there, not a security boundary.
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true, // required for the browser to send/receive the httpOnly refresh-token cookie
  }),
);
app.use(cookieParser());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(adminUsersRouter);
app.use(authRouter);
app.use(flatsRouter);
app.use(meRouter);
app.use(passwordResetRouter);
