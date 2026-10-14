import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment (e.g. systemd EnvironmentFile).
}

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? './data/app.db';
const webDist = fileURLToPath(new URL('../web/dist', import.meta.url));

const db = openDb(dbPath);
const app = Fastify({ logger: true });

app.get('/api/health', async () => {
  db.prepare('SELECT 1').get();
  return { ok: true };
});

if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist });
  // SPA fallback: anything that is not an API route gets index.html.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
} else {
  app.log.warn('web/dist not found; run "npm run build" in web/ to serve the frontend');
}

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '127.0.0.1' });
