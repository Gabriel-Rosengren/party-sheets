import { env } from './env';
import { prisma } from './db';
import { createServer } from './server';

const { httpServer, io } = createServer();

httpServer.listen(env.PORT, () => {
  console.log(`Party Sheets API listening on http://localhost:${env.PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, shutting down`);
  await io.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
