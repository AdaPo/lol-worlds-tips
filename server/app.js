import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import leaderboardRoutes from './routes/leaderboard.js';
import matchRoutes from './routes/matches.js';
import predictionRoutes from './routes/predictions.js';

export async function buildApp({ db, config }) {
  const app = Fastify({ logger: config.logger ?? true, trustProxy: config.trustProxy });

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });

  app.get('/api/health', async () => {
    db.prepare('SELECT 1').get();
    return { ok: true };
  });

  await app.register(authRoutes, { db, config });
  await app.register(matchRoutes, { db });
  await app.register(predictionRoutes, { db });
  await app.register(leaderboardRoutes, { db });
  await app.register(adminRoutes, { db, config });

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      // Vite puts a content hash in /assets/ file names, so those never change.
      // Everything else (index.html, manifest, icons) is revalidated each visit.
      setHeaders(reply, filePath) {
        reply.header(
          'cache-control',
          filePath.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
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

  return app;
}
