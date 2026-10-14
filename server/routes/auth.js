import {
  COOKIE,
  SESSION_DAYS,
  createSession,
  deleteSession,
  getSessionUser,
  hashPin,
  safeEqual,
  verifyPin,
} from '../auth.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

// Used to spend the same time on unknown names as on wrong PINs.
const DUMMY_HASH = hashPin('000000');

const credentialsBody = (props) => ({
  type: 'object',
  required: props,
  properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])),
});

export default async function authRoutes(app, { db, config }) {
  const rateLimit = {
    max: config.authRateLimitMax,
    timeWindow: '10 minutes',
  };

  // Failed login attempts per account name, in memory (reset on restart).
  const failures = new Map();

  const setSessionCookie = (reply, token) =>
    reply.setCookie(COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });

  app.post(
    '/api/auth/join',
    { config: { rateLimit }, schema: { body: credentialsBody(['inviteCode', 'name', 'pin']) } },
    async (request, reply) => {
      const { inviteCode, pin } = request.body;
      const name = request.body.name.trim();

      if (!safeEqual(inviteCode, config.inviteCode)) {
        return reply.code(403).send({ error: 'Invalid invite code' });
      }
      if (name.length < 1 || name.length > 30) {
        return reply.code(400).send({ error: 'Name must be 1-30 characters' });
      }
      if (!/^\d{6,12}$/.test(pin)) {
        return reply.code(400).send({ error: 'PIN must be 6-12 digits' });
      }
      if (db.prepare('SELECT 1 FROM users WHERE lower(name) = lower(?)').get(name)) {
        return reply.code(409).send({ error: 'Name already taken' });
      }

      const { lastInsertRowid } = db
        .prepare('INSERT INTO users (name, pin_hash) VALUES (?, ?)')
        .run(name, hashPin(pin));
      setSessionCookie(reply, createSession(db, lastInsertRowid));
      return { user: { id: Number(lastInsertRowid), name, isAdmin: false } };
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit }, schema: { body: credentialsBody(['name', 'pin']) } },
    async (request, reply) => {
      const { pin } = request.body;
      const name = request.body.name.trim();
      const key = name.toLowerCase();

      const entry = failures.get(key);
      if (entry?.until > Date.now()) {
        return reply.code(429).send({ error: 'Too many failed attempts, try again later' });
      }

      const user = db
        .prepare('SELECT id, name, pin_hash, is_admin FROM users WHERE lower(name) = lower(?)')
        .get(name);
      const ok = verifyPin(pin, user?.pin_hash ?? DUMMY_HASH) && user;

      if (!ok) {
        const lockExpired = entry?.until && entry.until <= Date.now();
        const count = (lockExpired ? 0 : (entry?.count ?? 0)) + 1;
        failures.set(key, {
          count,
          until: count >= MAX_FAILED_LOGINS ? Date.now() + LOCK_MS : 0,
        });
        return reply.code(401).send({ error: 'Invalid name or PIN' });
      }

      failures.delete(key);
      setSessionCookie(reply, createSession(db, user.id));
      return { user: { id: user.id, name: user.name, isAdmin: user.is_admin === 1 } };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE];
    if (token) deleteSession(db, token);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (request, reply) => {
    const user = getSessionUser(db, request.cookies[COOKIE]);
    if (!user) return reply.code(401).send({ error: 'Not logged in' });
    return { user: { id: user.id, name: user.name, isAdmin: user.is_admin === 1 } };
  });
}
