import express from 'express';
import { adminUsersRouter } from './routes/admin-users.route';
import { authRouter } from './routes/auth.route';
import { passwordResetRouter } from './routes/password-reset.route';

export const app = express();

app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use(adminUsersRouter);
app.use(authRouter);
app.use(passwordResetRouter);
