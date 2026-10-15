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

describe('scorePrediction by best-of', () => {
  it.each([
    // best-of-1: the score is just the winner, so a right pick is worth 1
    [1, { team1: 1, team2: 0 }, { team1: 1, team2: 0 }, 1],
    [1, { team1: 0, team2: 1 }, { team1: 0, team2: 1 }, 1],
    [1, { team1: 0, team2: 1 }, { team1: 1, team2: 0 }, 0],
    // best-of-3 and best-of-5 keep exact 3 / winner 1
    [3, { team1: 2, team2: 1 }, { team1: 2, team2: 1 }, 3],
    [3, { team1: 2, team2: 0 }, { team1: 2, team2: 1 }, 1],
    [5, { team1: 3, team2: 2 }, { team1: 3, team2: 2 }, 3],
    [5, { team1: 3, team2: 0 }, { team1: 3, team2: 2 }, 1],
    [5, { team1: 0, team2: 3 }, { team1: 3, team2: 2 }, 0],
  ])('best of %i: pick %j vs result %j -> %i', (bestOf, pred, result, expected) => {
    expect(scorePrediction(pred, result, bestOf)).toBe(expected);
  });

  it('never gives more than 1 point in a best-of-1', () => {
    const results = [
      { team1: 1, team2: 0 },
      { team1: 0, team2: 1 },
    ];
    for (const pred of results) {
      for (const result of results) {
        expect(scorePrediction(pred, result, 1)).toBeLessThanOrEqual(1);
      }
    }
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

  it('gives 1 point for the right winner of a best-of-1, and no exact-hit credit', async () => {
    addMatch('bo1', 1);
    addMatch('bo3', 3);
    const alice = await joinAs('Alice');
    const bob = await joinAs('Bob');
    await pick(alice, 'bo1', 1, 0); // right winner
    await pick(bob, 'bo1', 0, 1); // wrong winner
    await pick(alice, 'bo3', 2, 1); // exact
    await setResult('bo1', 1, 0);
    await setResult('bo3', 2, 1);

    expect(points(alice, 'bo1')).toBe(1);
    expect(points(bob, 'bo1')).toBe(0);
    expect(points(alice, 'bo3')).toBe(3);

    const board = await call('GET', '/api/leaderboard', { cookie: alice.cookie });
    expect(board.json()[0]).toMatchObject({
      name: 'Alice',
      totalPoints: 4,
      exactHits: 1, // only the best-of-3
      correctWinners: 2,
    });
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

  it('lists a player’s past picks from the newest match to the oldest', async () => {
    const alice = await joinAs('Alice');
    const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
    const addMatchAt = db.prepare(
      `INSERT INTO matches (id, team1, team2, best_of, start_time, locked_at, state)
       VALUES (?, 'T1', 'G2', 3, ?, ?, 'completed')`,
    );
    // Inserted out of order on purpose.
    addMatchAt.run('oldest', daysAgo(5), daysAgo(5));
    addMatchAt.run('newest', daysAgo(1), daysAgo(1));
    addMatchAt.run('middle', daysAgo(3), daysAgo(3));
    for (const id of ['oldest', 'newest', 'middle']) {
      db.prepare(
        'INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2) VALUES (?, ?, 2, 0)',
      ).run(alice.id, id);
    }

    const res = await call('GET', `/api/users/${alice.id}/predictions`, { cookie: alice.cookie });
    expect(res.json().predictions.map((p) => p.matchId)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('returns 404 for an unknown user and requires a session', async () => {
    const alice = await joinAs('Alice');
    expect(
      (await call('GET', '/api/users/999/predictions', { cookie: alice.cookie })).statusCode,
    ).toBe(404);
    expect((await call('GET', '/api/leaderboard')).statusCode).toBe(401);
  });
});
