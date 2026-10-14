import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { isTbd, isValidScore } from '../server/validation.js';

describe('isValidScore', () => {
  it.each([
    [1, 1, 0, true],
    [1, 0, 1, true],
    [1, 1, 1, false],
    [1, 0, 0, false],
    [3, 2, 0, true],
    [3, 2, 1, true],
    [3, 1, 2, true],
    [3, 0, 2, true],
    [3, 2, 2, false],
    [3, 3, 0, false],
    [3, 1, 0, false],
    [5, 3, 0, true],
    [5, 3, 2, true],
    [5, 2, 3, true],
    [5, 0, 3, true],
    [5, 2, 2, false],
    [5, 3, 3, false],
    [5, 2, 1, false],
    [3, -1, 2, false],
    [2, 1, 0, false],
  ])('best of %i, %i-%i -> %s', (bestOf, t1, t2, expected) => {
    expect(isValidScore(t1, t2, bestOf)).toBe(expected);
  });

  it('rejects non-integers', () => {
    expect(isValidScore(1.5, 0, 3)).toBe(false);
    expect(isValidScore('2', 0, 3)).toBe(false);
  });
});

describe('isTbd', () => {
  it('treats null, empty and "TBD" as undecided', () => {
    expect(isTbd(null)).toBe(true);
    expect(isTbd('')).toBe(true);
    expect(isTbd(' tbd ')).toBe(true);
    expect(isTbd('T1')).toBe(false);
  });
});

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

describe('matches, predictions and admin routes', () => {
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
    return `session=${res.cookies.find((c) => c.name === 'session').value}`;
  };

  const insertMatch = (over = {}) => {
    const m = {
      id: 'm1',
      stage: 'Swiss',
      team1: 'T1',
      team2: 'G2',
      team1_code: 'T1',
      team2_code: 'G2',
      best_of: 3,
      start_time: FUTURE,
      state: 'unstarted',
      ...over,
    };
    db.prepare(
      `INSERT INTO matches (id, stage, team1, team2, team1_code, team2_code, best_of, start_time, state)
       VALUES (@id, @stage, @team1, @team2, @team1_code, @team2_code, @best_of, @start_time, @state)`,
    ).run(m);
    return m;
  };

  const matchesFor = async (cookie) => (await call('GET', '/api/matches', { cookie })).json();

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

  describe('predictions', () => {
    it('requires a session', async () => {
      insertMatch();
      const res = await call('PUT', '/api/predictions/m1', { payload: { team1: 2, team2: 0 } });
      expect(res.statusCode).toBe(401);
      expect((await call('GET', '/api/matches')).statusCode).toBe(401);
    });

    it('saves a prediction and shows it as my prediction', async () => {
      insertMatch();
      const cookie = await joinAs('Alice');
      const res = await call('PUT', '/api/predictions/m1', {
        cookie,
        payload: { team1: 2, team2: 1 },
      });
      expect(res.statusCode).toBe(200);

      const [match] = await matchesFor(cookie);
      expect(match.myPrediction).toEqual({ team1: 2, team2: 1, points: null });
      expect(match.locked).toBe(false);
      expect(match.predictions).toBeNull();
    });

    it('overwrites an earlier prediction', async () => {
      insertMatch();
      const cookie = await joinAs('Alice');
      await call('PUT', '/api/predictions/m1', { cookie, payload: { team1: 2, team2: 0 } });
      await call('PUT', '/api/predictions/m1', { cookie, payload: { team1: 0, team2: 2 } });
      const [match] = await matchesFor(cookie);
      expect(match.myPrediction.team2).toBe(2);
      expect(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n).toBe(1);
    });

    it('rejects scores that do not fit the best-of', async () => {
      insertMatch({ best_of: 3 });
      const cookie = await joinAs('Alice');
      for (const [team1, team2] of [
        [2, 2],
        [3, 0],
        [1, 0],
      ]) {
        const res = await call('PUT', '/api/predictions/m1', { cookie, payload: { team1, team2 } });
        expect(res.statusCode).toBe(400);
      }
    });

    it('returns 404 for an unknown match', async () => {
      const cookie = await joinAs('Alice');
      const res = await call('PUT', '/api/predictions/nope', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects a prediction once the match has started and records locked_at', async () => {
      insertMatch({ start_time: PAST });
      const cookie = await joinAs('Alice');
      const res = await call('PUT', '/api/predictions/m1', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });
      expect(res.statusCode).toBe(409);
      expect(db.prepare('SELECT locked_at FROM matches').get().locked_at).not.toBeNull();
    });

    it('rejects a prediction when the state is no longer unstarted', async () => {
      insertMatch({ state: 'inProgress' });
      const cookie = await joinAs('Alice');
      const res = await call('PUT', '/api/predictions/m1', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('rejects a prediction while a team is TBD', async () => {
      insertMatch({ team2: null });
      const cookie = await joinAs('Alice');
      const res = await call('PUT', '/api/predictions/m1', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('does not reopen a locked match when its start_time moves later', async () => {
      insertMatch({ start_time: PAST });
      const cookie = await joinAs('Alice');
      await matchesFor(cookie); // locks the match
      db.prepare('UPDATE matches SET start_time = ?').run(FUTURE);

      const res = await call('PUT', '/api/predictions/m1', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });
      expect(res.statusCode).toBe(409);
    });

    it('hides other players picks until the match is locked', async () => {
      insertMatch();
      const alice = await joinAs('Alice');
      const bob = await joinAs('Bob');
      await call('PUT', '/api/predictions/m1', { cookie: alice, payload: { team1: 2, team2: 0 } });
      await call('PUT', '/api/predictions/m1', { cookie: bob, payload: { team1: 0, team2: 2 } });

      const [before] = await matchesFor(bob);
      expect(before.predictions).toBeNull();

      db.prepare('UPDATE matches SET start_time = ?').run(PAST);
      const [after] = await matchesFor(bob);
      expect(after.locked).toBe(true);
      expect(after.predictions.map((p) => [p.name, p.team1, p.team2])).toEqual([
        ['Alice', 2, 0],
        ['Bob', 0, 2],
      ]);
    });

    it('lists matches ordered by start time', async () => {
      insertMatch({ id: 'later', start_time: new Date(Date.now() + 2 * 86400000).toISOString() });
      insertMatch({ id: 'sooner', start_time: FUTURE });
      const cookie = await joinAs('Alice');
      expect((await matchesFor(cookie)).map((m) => m.id)).toEqual(['sooner', 'later']);
    });
  });

  describe('admin', () => {
    it('rejects a missing or wrong admin token', async () => {
      const payload = { bestOf: 3, startTime: FUTURE };
      expect((await call('POST', '/api/admin/matches', { payload })).statusCode).toBe(403);
      expect(
        (await call('POST', '/api/admin/matches', { payload, admin: 'wrong' })).statusCode,
      ).toBe(403);
    });

    it('answers 403 before validating the body when unauthenticated', async () => {
      const res = await call('POST', '/api/admin/matches', { payload: {} });
      expect(res.statusCode).toBe(403);
    });

    it('creates a manual match that shows up in the list', async () => {
      const cookie = await joinAs('Alice');
      const res = await call('POST', '/api/admin/matches', {
        admin: 'admin-secret',
        payload: { stage: 'Final', team1: 'T1', team2: 'G2', bestOf: 5, startTime: FUTURE },
      });
      expect(res.statusCode).toBe(200);
      const [match] = await matchesFor(cookie);
      expect(match.id).toMatch(/^manual-/);
      expect(match.bestOf).toBe(5);
      expect(match.startTime).toBe(FUTURE);
    });

    it('rejects an invalid best-of or start time', async () => {
      const bad = [
        { bestOf: 2, startTime: FUTURE },
        { bestOf: 3, startTime: 'not a date' },
      ];
      for (const payload of bad) {
        const res = await call('POST', '/api/admin/matches', { admin: 'admin-secret', payload });
        expect(res.statusCode).toBe(400);
      }
    });

    it('sets a result, completes the match and locks it', async () => {
      insertMatch();
      const res = await call('PUT', '/api/admin/matches/m1/result', {
        admin: 'admin-secret',
        payload: { team1Wins: 2, team2Wins: 1 },
      });
      expect(res.statusCode).toBe(200);
      const row = db.prepare('SELECT * FROM matches WHERE id = ?').get('m1');
      expect(row).toMatchObject({
        team1_wins: 2,
        team2_wins: 1,
        state: 'completed',
        manual_override: 1,
      });
      expect(row.locked_at).not.toBeNull();
    });

    it('rejects an invalid result score', async () => {
      insertMatch();
      const res = await call('PUT', '/api/admin/matches/m1/result', {
        admin: 'admin-secret',
        payload: { team1Wins: 2, team2Wins: 2 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('deletes a manual match with its predictions but not an API match', async () => {
      insertMatch({ id: 'manual-1' });
      insertMatch({ id: 'api-1' });
      const cookie = await joinAs('Alice');
      await call('PUT', '/api/predictions/manual-1', {
        cookie,
        payload: { team1: 2, team2: 0 },
      });

      const del = await call('DELETE', '/api/admin/matches/manual-1', { admin: 'admin-secret' });
      expect(del.statusCode).toBe(200);
      expect(db.prepare('SELECT COUNT(*) AS n FROM predictions').get().n).toBe(0);

      const refused = await call('DELETE', '/api/admin/matches/api-1', { admin: 'admin-secret' });
      expect(refused.statusCode).toBe(400);
    });
  });
});
