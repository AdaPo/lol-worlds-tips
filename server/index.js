import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { WORLDS_LEAGUE_ID, fetchMatches } from './services/esportsApi.js';
import { createSync } from './services/sync.js';

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
const apiKey = process.env.ESPORTS_API_KEY;
let sync = null;

const app = await buildApp({
  db,
  config: {
    inviteCode: process.env.INVITE_CODE,
    adminToken: process.env.ADMIN_TOKEN,
    secureCookies: process.env.NODE_ENV === 'production',
    // Enable only if Tailscale Funnel forwards the client IP in X-Forwarded-For.
    trustProxy: process.env.TRUST_PROXY === 'true',
    // Login/join attempts per IP per 10 minutes. Raise it if every friend shares one IP.
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
    webDist: fileURLToPath(new URL('../web/dist', import.meta.url)),
    runSync: apiKey ? () => sync.runNow() : null,
  },
});

if (apiKey) {
  const leagueId = process.env.ESPORTS_LEAGUE_ID || WORLDS_LEAGUE_ID;
  // Only matches from this year are imported, so last year's Worlds is ignored.
  const since = process.env.ESPORTS_SINCE || `${new Date().getUTCFullYear()}-01-01T00:00:00Z`;
  sync = createSync({
    db,
    log: app.log,
    fetchMatches: () => fetchMatches({ leagueId, apiKey, since }),
  });
} else {
  app.log.warn('ESPORTS_API_KEY not set; automatic sync is off (use the admin page instead)');
}

const shutdown = async () => {
  sync?.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port, host: '127.0.0.1' });
sync?.start();
