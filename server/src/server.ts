import { createServer as createHttpServer } from 'node:http';
import { createApp } from './app';
import { createIoServer, registerSocketHandlers, socketNotifier } from './realtime/socket';

/** Builds the HTTP + Socket.IO server without listening, so tests can choose a port. */
export const createServer = () => {
  const io = createIoServer();
  registerSocketHandlers(io);

  const app = createApp({ realtime: socketNotifier(io) });
  const httpServer = createHttpServer(app);
  io.attach(httpServer);

  return { app, httpServer, io };
};
