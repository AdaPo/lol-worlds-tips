import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 30;

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
        `SELECT users.id, users.name FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = ? AND sessions.expires_at > ?`,
      )
      .get(token, new Date().toISOString()) ?? null
  );
}

export function deleteSession(db, token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}
