import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { scorePrediction } from '../server/services/scoring.js';

describe('scorePrediction', () => {
  it.each([
    [{ team1: 2, team2: 1 }, { team1: 2, team2: 1 }, 3],
    [{ team1: 2, team2: 0 }, { team1: 2, team2: 1 }, 1],
    [{ team1: 0, team2: 2 }, { team1: 2, team2: 1 }, 0],
    [{ team1: 1, team2: 2 }, { team1: 1, team2: 2 }, 3],
    [{ team1: 1, team2: 2 }, { team1: 0, team2: 2 }, 1],
    [{ team1: 3, team2: 0 }, { team1: 1, team2: 3 }, 0],
  ])('pick %j vs result %j -> %i', (pred, result, expected) => {
    expect(scorePrediction(pred, result)).toBe(expected);
  });
});

const FUTURE = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe('scoring, leaderboard and rescore routes', () => {
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

  const addMatch = (id, bestOf = 3) =>
    db
      .prepare(
        `INSERT INTO matches (id, team1, team2, best_of, start_time) VALUES (?, 'T1', 'G2', ?, ?)`,
      )
      .run(id, bestOf, FUTURE);

  const pick = (user, matchId, team1, team2) =>
    call('PUT', `/api/predictions/${matchId}`, { cookie: user.cookie, payload: { team1, team2 } });

  const setResult = (matchId, team1Wins, team2Wins) =>
    call('PUT', `/api/admin/matches/${matchId}/result`, {
      admin: 'admin-secret',
      payload: { team1Wins, team2Wins },
    });

  const points = (user, matchId) =>
    db
      .prepare('SELECT points FROM predictions WHERE user_id = ? AND match_id = ?')
      .get(user.id, matchId).points;

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

  it('scores picks when an admin sets the result', async () => {
    addMatch('m1');
    const alice = await joinAs('Alice');
    const bob = await joinAs('Bob');
    const cara = await joinAs('Cara');
    await pick(alice, 'm1', 2, 1);
    await pick(bob, 'm1', 2, 0);
    await pick(cara, 'm1', 0, 2);

    await setResult('m1', 2, 1);

    expect(points(alice, 'm1')).toBe(3);
    expect(points(bob, 'm1')).toBe(1);
    expect(points(cara, 'm1')).toBe(0);
    expect(db.prepare('SELECT scored_at FROM matches').get().scored_at).not.toBeNull();
  });

  it('rescore is idempotent and fixes points after a result is corrected', async () => {
    addMatch('m1');
    const alice = await joinAs('Alice');
    await pick(alice, 'm1', 2, 1);
    await setResult('m1', 2, 1);
    expect(points(alice, 'm1')).toBe(3);

    const first = await call('POST', '/api/admin/rescore', { admin: 'admin-secret' });
    await call('POST', '/api/admin/rescore', { admin: 'admin-secret' });
    expect(first.json()).toEqual({ matches: 1 });
    expect(points(alice, 'm1')).toBe(3);

    // Result entered wrong; correct it directly and rescore.
    db.prepare('UPDATE matches SET team1_wins = 0, team2_wins = 2').run();
    await call('POST', '/api/admin/rescore', { admin: 'admin-secret' });
    expect(points(alice, 'm1')).toBe(0);
  });

  it('rescore requires the admin token', async () => {
    expect((await call('POST', '/api/admin/rescore')).statusCode).toBe(403);
  });

  it('ranks players by points, then exact hits, with shared ranks for ties', async () => {
    addMatch('m1');
    addMatch('m2', 5);
    const alice = await joinAs('Alice');
    const bob = await joinAs('Bob');
    const cara = await joinAs('Cara');
    const dan = await joinAs('Dan');
    // m1 result 2-1, m2 result 3-0
    await pick(alice, 'm1', 2, 1); // 3
    await pick(alice, 'm2', 3, 1); // 1  -> 4 points, 1 exact
    await pick(bob, 'm1', 2, 0); // 1
    await pick(bob, 'm2', 3, 0); // 3  -> 4 points, 1 exact (ties Alice)
    await pick(cara, 'm1', 2, 0); // 1  -> 1 point
    await setResult('m1', 2, 1);
    await setResult('m2', 3, 0);

    const res = await call('GET', '/api/leaderboard', { cookie: dan.cookie });
    expect(res.json()).toEqual([
      { rank: 1, userId: alice.id, name: 'Alice', totalPoints: 4, exactHits: 1, correctWinners: 2 },
      { rank: 1, userId: bob.id, name: 'Bob', totalPoints: 4, exactHits: 1, correctWinners: 2 },
      { rank: 3, userId: cara.id, name: 'Cara', totalPoints: 1, exactHits: 0, correctWinners: 1 },
      { rank: 4, userId: dan.id, name: 'Dan', totalPoints: 0, exactHits: 0, correctWinners: 0 },
    ]);
  });

  it('leaves hidden players out of the leaderboard and the shared picks', async () => {
    addMatch('m1');
    const alice = await joinAs('Alice');
    const boss = await joinAs('Boss');
    db.prepare('UPDATE users SET hidden = 1 WHERE id = ?').run(boss.id);
    await pick(alice, 'm1', 2, 0);
    await pick(boss, 'm1', 2, 0);
    await setResult('m1', 2, 0);

    const board = await call('GET', '/api/leaderboard', { cookie: alice.cookie });
    expect(board.json().map((r) => r.name)).toEqual(['Alice']);

    const matches = await call('GET', '/api/matches', { cookie: alice.cookie });
    expect(matches.json()[0].predictions.map((p) => p.name)).toEqual(['Alice']);
  });

  it('keeps an admin who is not hidden on the leaderboard', async () => {
    addMatch('m1');
    const alice = await joinAs('Alice');
    const friend = await joinAs('Friend');
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(friend.id);
    await pick(alice, 'm1', 2, 0);
    await pick(friend, 'm1', 2, 0);
    await setResult('m1', 2, 0);

    const board = await call('GET', '/api/leaderboard', { cookie: alice.cookie });
    expect(board.json().map((r) => r.name).sort()).toEqual(['Alice', 'Friend']);
  });

  it('shows a player only their locked-match picks', async () => {
    addMatch('open');
    addMatch('done');
    const alice = await joinAs('Alice');
    const bob = await joinAs('Bob');
    await pick(alice, 'open', 2, 0);
    await pick(alice, 'done', 2, 1);
    await setResult('done', 2, 1);

    const res = await call('GET', `/api/users/${alice.id}/predictions`, { cookie: bob.cookie });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.name).toBe('Alice');
    expect(res.json().predictions).toEqual([
      expect.objectContaining({
        matchId: 'done',
        prediction: { team1: 2, team2: 1 },
        result: { team1: 2, team2: 1 },
        points: 3,
      }),
    ]);
  });

  it('returns 404 for an unknown user and requires a session', async () => {
    const alice = await joinAs('Alice');
    expect(
      (await call('GET', '/api/users/999/predictions', { cookie: alice.cookie })).statusCode,
    ).toBe(404);
    expect((await call('GET', '/api/leaderboard')).statusCode).toBe(401);
  });
});
