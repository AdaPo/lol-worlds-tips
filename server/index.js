import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDb } from './db.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment (e.g. systemd EnvironmentFile).
}

const port = Number(process.env.PORT ?? 3000);
const dbPath = process.env.DB_PATH ?? './data/app.db';

if (!process.env.INVITE_CODE || !process.env.ADMIN_TOKEN) {
  console.error('INVITE_CODE and ADMIN_TOKEN must be set (see .env.example)');
  process.exit(1);
}

const db = openDb(dbPath);
const app = await buildApp({
  db,
  config: {
    inviteCode: process.env.INVITE_CODE,
    adminToken: process.env.ADMIN_TOKEN,
    secureCookies: process.env.NODE_ENV === 'production',
    // Enable only if Tailscale Funnel forwards the client IP in X-Forwarded-For.
    trustProxy: process.env.TRUST_PROXY === 'true',
    authRateLimitMax: 10,
    webDist: fileURLToPath(new URL('../web/dist', import.meta.url)),
  },
});

const shutdown = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '127.0.0.1' });
