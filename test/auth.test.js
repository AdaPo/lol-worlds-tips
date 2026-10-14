import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPin, safeEqual, verifyPin } from '../server/auth.js';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';

describe('pin hashing', () => {
  it('verifies the right PIN and rejects a wrong one', () => {
    const hash = hashPin('123456');
    expect(verifyPin('123456', hash)).toBe(true);
    expect(verifyPin('654321', hash)).toBe(false);
  });

  it('salts each hash', () => {
    expect(hashPin('123456')).not.toBe(hashPin('123456'));
  });
});

describe('safeEqual', () => {
  it('compares strings of different lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('auth routes', () => {
  let db;
  let app;

  const post = (url, payload, headers) => app.inject({ method: 'POST', url, payload, headers });
  const cookieOf = (res) => `session=${res.cookies.find((c) => c.name === 'session').value}`;
  const join = (over = {}) =>
    post('/api/auth/join', { inviteCode: 'secret', name: 'Alice', pin: '123456', ...over });

  beforeEach(async () => {
    db = openDb(':memory:');
    app = await buildApp({
      db,
      config: { inviteCode: 'secret', secureCookies: false, authRateLimitMax: 100, logger: false },
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('joins with the invite code and sets an HttpOnly session cookie', async () => {
    const res = await join();
    expect(res.statusCode).toBe(200);
    expect(res.json().user.name).toBe('Alice');
    const cookie = res.cookies.find((c) => c.name === 'session');
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe('Lax');
  });

  it('rejects a wrong invite code', async () => {
    expect((await join({ inviteCode: 'nope' })).statusCode).toBe(403);
  });

  it('rejects PINs shorter than 6 digits and non-numeric PINs', async () => {
    expect((await join({ pin: '1234' })).statusCode).toBe(400);
    expect((await join({ pin: 'abcdef' })).statusCode).toBe(400);
  });

  it('rejects a duplicate name, ignoring case', async () => {
    await join();
    expect((await join({ name: 'alice' })).statusCode).toBe(409);
  });

  it('logs in with the right PIN and returns the user from /api/me', async () => {
    await join();
    const res = await post('/api/auth/login', { name: 'alice', pin: '123456' });
    expect(res.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: cookieOf(res) },
    });
    expect(me.json().user.name).toBe('Alice');
  });

  it('rejects a wrong PIN and an unknown name with the same response', async () => {
    await join();
    const wrongPin = await post('/api/auth/login', { name: 'Alice', pin: '000000' });
    const unknown = await post('/api/auth/login', { name: 'Bob', pin: '123456' });
    expect(wrongPin.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json()).toEqual(wrongPin.json());
  });

  it('locks the name after 5 failed attempts, even for the right PIN', async () => {
    await join();
    for (let i = 0; i < 5; i++) {
      await post('/api/auth/login', { name: 'Alice', pin: '000000' });
    }
    const res = await post('/api/auth/login', { name: 'Alice', pin: '123456' });
    expect(res.statusCode).toBe(429);
  });

  it('returns 401 from /api/me without a session', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
  });

  it('logout invalidates the session', async () => {
    const joined = await join();
    const headers = { cookie: cookieOf(joined) };
    await post('/api/auth/logout', {}, headers);
    const me = await app.inject({ method: 'GET', url: '/api/me', headers });
    expect(me.statusCode).toBe(401);
  });

  it('rejects an expired session', async () => {
    const joined = await join();
    db.prepare('UPDATE sessions SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { cookie: cookieOf(joined) },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe('auth rate limiting', () => {
  it('returns 429 once an IP exceeds the limit', async () => {
    const db = openDb(':memory:');
    const app = await buildApp({
      db,
      config: { inviteCode: 'secret', secureCookies: false, authRateLimitMax: 3, logger: false },
    });
    const codes = [];
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { name: `user${i}`, pin: '123456' },
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([401, 401, 401, 429]);
    await app.close();
    db.close();
  });
});
