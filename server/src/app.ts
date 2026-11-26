import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { authRouter } from './routes/auth';
import { campaignsRouter } from './routes/campaigns';
import { sheetsRouter } from './routes/sheets';
import { errorHandler } from './lib/error-handler';
import type { RealtimeNotifier } from './realtime/notifier';

export interface AppDeps {
  realtime: RealtimeNotifier;
}

export const createApp = ({ realtime }: AppDeps) => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/campaigns', campaignsRouter(realtime));
  app.use('/api/sheets', sheetsRouter(realtime));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);
  return app;
};
