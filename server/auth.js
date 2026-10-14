import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 30;
export const COOKIE = 'session';

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Compares two strings in constant time, regardless of length.
export function safeEqual(a, b) {
  const digest = (s) => createHash('sha256').update(String(s)).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt,
  );
  return token;
}

export function getSessionUser(db, token) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT users.id, users.name, users.is_admin FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = ? AND sessions.expires_at > ?`,
      )
      .get(token, new Date().toISOString()) ?? null
  );
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

// Fastify preHandler: rejects with 401 unless the session cookie is valid.
export function requireUser(db) {
  return async (request, reply) => {
    const user = getSessionUser(db, request.cookies[COOKIE]);
    if (!user) return reply.code(401).send({ error: 'Not logged in' });
    request.user = user;
  };
}

// Fastify hook: allows a matching x-admin-token header, or a logged-in admin user.
export function requireAdmin(db, adminToken) {
  return async (request, reply) => {
    const provided = request.headers['x-admin-token'];
    if (adminToken && typeof provided === 'string' && safeEqual(provided, adminToken)) return;

    const user = getSessionUser(db, request.cookies[COOKIE]);
    if (user?.is_admin) {
      request.user = user;
      return;
    }
    return reply.code(403).send({ error: 'Forbidden' });
  };
}
