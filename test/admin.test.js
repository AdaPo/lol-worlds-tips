import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';

describe('admin access via user accounts', () => {
  let db;
  let app;

  const call = (method, url, { payload, cookie, admin } = {}) =>
    app.inject({
      method,
      url,
      payload,
      headers: { ...(cookie && { cookie }), ...(admin && { 'x-admin-token': admin }) },
    });

  const joinAs = async (name) => {
    const res = await call('POST', '/api/auth/join', {
      payload: { inviteCode: 'secret', name, pin: '123456' },
    });
    return {
      id: res.json().user.id,
      cookie: `session=${res.cookies.find((c) => c.name === 'session').value}`,
    };
  };

  const makeAdmin = (user) => db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);

  beforeEach(async () => {
    db = openDb(':memory:');
    app = await buildApp({
      db,
      config: {
        inviteCode: 'secret',
        adminToken: 'admin-secret',
        secureCookies: false,
        authRateLimitMax: 100,
        logger: false,
      },
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('reports isAdmin on /api/me', async () => {
    const alice = await joinAs('Alice');
    const before = await call('GET', '/api/me', { cookie: alice.cookie });
    expect(before.json().user.isAdmin).toBe(false);

    makeAdmin(alice);
    const after = await call('GET', '/api/me', { cookie: alice.cookie });
    expect(after.json().user.isAdmin).toBe(true);
  });

  it('refuses a normal user and allows an admin user without a token', async () => {
    const alice = await joinAs('Alice');
    expect((await call('GET', '/api/admin/users', { cookie: alice.cookie })).statusCode).toBe(403);

    makeAdmin(alice);
    expect((await call('GET', '/api/admin/users', { cookie: alice.cookie })).statusCode).toBe(200);
  });

  it('still accepts the admin token', async () => {
    const res = await call('GET', '/api/admin/users', { admin: 'admin-secret' });
    expect(res.statusCode).toBe(200);
  });

  it('lets an admin user add a match and set a result', async () => {
    const alice = await joinAs('Alice');
    makeAdmin(alice);
    const start = new Date(Date.now() + 86400000).toISOString();

    const created = await call('POST', '/api/admin/matches', {
      cookie: alice.cookie,
      payload: { team1: 'T1', team2: 'G2', bestOf: 3, startTime: start },
    });
    expect(created.statusCode).toBe(200);

    const result = await call('PUT', `/api/admin/matches/${created.json().match.id}/result`, {
      cookie: alice.cookie,
      payload: { team1Wins: 2, team2Wins: 0 },
    });
    expect(result.statusCode).toBe(200);
  });

  it('lists users with their admin flag and lets an admin grant and revoke it', async () => {
    const alice = await joinAs('Alice');
    const bob = await joinAs('Bob');
    makeAdmin(alice);

    const list = await call('GET', '/api/admin/users', { cookie: alice.cookie });
    expect(list.json()).toEqual([
      { id: alice.id, name: 'Alice', isAdmin: true },
      { id: bob.id, name: 'Bob', isAdmin: false },
    ]);

    await call('PUT', `/api/admin/users/${bob.id}/admin`, {
      cookie: alice.cookie,
      payload: { isAdmin: true },
    });
    expect((await call('GET', '/api/admin/users', { cookie: bob.cookie })).statusCode).toBe(200);

    await call('PUT', `/api/admin/users/${bob.id}/admin`, {
      cookie: alice.cookie,
      payload: { isAdmin: false },
    });
    expect((await call('GET', '/api/admin/users', { cookie: bob.cookie })).statusCode).toBe(403);
  });

  it('stops an admin changing their own admin status', async () => {
    const alice = await joinAs('Alice');
    makeAdmin(alice);
    const res = await call('PUT', `/api/admin/users/${alice.id}/admin`, {
      cookie: alice.cookie,
      payload: { isAdmin: false },
    });
    expect(res.statusCode).toBe(400);
  });

  describe('removing users', () => {
    it('deletes a player with their sessions and picks', async () => {
      const alice = await joinAs('Alice');
      const bob = await joinAs('Bob');
      makeAdmin(alice);
      db.prepare(
        `INSERT INTO matches (id, team1, team2, best_of, start_time) VALUES ('m1','T1','G2',3,?)`,
      ).run(new Date(Date.now() + 86400000).toISOString());
      await call('PUT', '/api/predictions/m1', { cookie: bob.cookie, payload: { team1: 2, team2: 0 } });

      const res = await call('DELETE', `/api/admin/users/${bob.id}`, { cookie: alice.cookie });
      expect(res.statusCode).toBe(200);
      expect(db.prepare('SELECT COUNT(*) AS n FROM users WHERE id = ?').get(bob.id).n).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n).toBe(0);
      expect((await call('GET', '/api/me', { cookie: bob.cookie })).statusCode).toBe(401);
    });

    it('frees the name for reuse', async () => {
      await joinAs('Bob');
      const bob = db.prepare("SELECT id FROM users WHERE name = 'Bob'").get();
      await call('DELETE', `/api/admin/users/${bob.id}`, { admin: 'admin-secret' });
      const again = await call('POST', '/api/auth/join', {
        payload: { inviteCode: 'secret', name: 'Bob', pin: '123456' },
      });
      expect(again.statusCode).toBe(200);
    });

    it('refuses to remove yourself or another admin', async () => {
      const alice = await joinAs('Alice');
      const bob = await joinAs('Bob');
      makeAdmin(alice);
      makeAdmin(bob);
      const self = await call('DELETE', `/api/admin/users/${alice.id}`, { cookie: alice.cookie });
      const other = await call('DELETE', `/api/admin/users/${bob.id}`, { cookie: alice.cookie });
      expect(self.statusCode).toBe(400);
      expect(other.statusCode).toBe(400);
    });

    it('requires admin and returns 404 for an unknown user', async () => {
      const alice = await joinAs('Alice');
      expect((await call('DELETE', `/api/admin/users/${alice.id}`)).statusCode).toBe(403);
      expect(
        (await call('DELETE', '/api/admin/users/999', { admin: 'admin-secret' })).statusCode,
      ).toBe(404);
    });
  });

  it('returns 404 for an unknown user', async () => {
    const res = await call('PUT', '/api/admin/users/999/admin', {
      admin: 'admin-secret',
      payload: { isAdmin: true },
    });
    expect(res.statusCode).toBe(404);
  });
});
