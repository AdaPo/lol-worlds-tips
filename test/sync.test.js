import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../server/app.js';
import { openDb } from '../server/db.js';
import { fetchMatches, parseEvent } from '../server/services/esportsApi.js';
import {
  LIVE_INTERVAL_MS,
  MAX_SLEEP_MS,
  PRE_INTERVAL_MS,
  createSync,
  planSync,
  syncMatches,
} from '../server/services/sync.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/schedule.json', import.meta.url)));
const events = fixture.data.schedule.events;
const [completedBo1, completedBo3, tbdBo5, openBo5] = events;

const silent = { info() {}, warn() {}, error() {} };

describe('parseEvent (real API samples)', () => {
  it('parses a completed Bo1 with its result', () => {
    expect(parseEvent(completedBo1)).toEqual({
      id: '113475798006599034',
      stage: 'Swiss',
      team1: 'Vivo Keyd Stars',
      team2: 'Team Secret Whales',
      team1Code: 'VKS',
      team2Code: 'TSW',
      team1Image: 'https://static.lolesports.com/teams/1670542079678_vks.png',
      team2Image: 'https://static.lolesports.com/teams/1774598000328_White_EyeText_600p.png',
      bestOf: 1,
      startTime: '2025-10-15T05:00:00.000Z',
      state: 'completed',
      team1Wins: 0,
      team2Wins: 1,
    });
  });

  it('parses a completed Bo3', () => {
    const m = parseEvent(completedBo3);
    expect(m.bestOf).toBe(3);
    expect(m.state).toBe('completed');
    expect([m.team1Wins, m.team2Wins]).toEqual(
      [
        completedBo3.match.teams[0].result.gameWins,
        completedBo3.match.teams[1].result.gameWins,
      ],
    );
  });

  it('turns TBD teams into nulls and ignores the placeholder score', () => {
    const m = parseEvent(tbdBo5);
    expect(m).toMatchObject({
      team1: null,
      team2: null,
      team1Code: null,
      team2Code: null,
      team1Image: null,
      team2Image: null,
      state: 'unstarted',
      team1Wins: null,
      team2Wins: null,
    });
  });

  it('does not trust gameWins before a match is completed', () => {
    const m = parseEvent(openBo5);
    expect(m.state).toBe('unstarted');
    expect(m.team1Wins).toBeNull();
    expect(m.team1).toBe('Cloud9 Kia');
  });

  it('maps inProgress and unknown states', () => {
    expect(parseEvent({ ...openBo5, state: 'inProgress' }).state).toBe('inProgress');
    expect(parseEvent({ ...openBo5, state: 'weird' }).state).toBe('unstarted');
  });

  it('ignores non-match events and malformed matches', () => {
    expect(parseEvent({ ...openBo5, type: 'show' })).toBeNull();
    expect(parseEvent({ ...openBo5, match: { ...openBo5.match, teams: [] } })).toBeNull();
    const badBo = { ...openBo5, match: { ...openBo5.match, strategy: { count: 2 } } };
    expect(parseEvent(badBo)).toBeNull();
    expect(parseEvent({ ...openBo5, startTime: 'nonsense' })).toBeNull();
  });

  it('drops an impossible score and warns', () => {
    const bad = JSON.parse(JSON.stringify(completedBo3));
    bad.match.teams[0].result.gameWins = 3;
    bad.match.teams[1].result.gameWins = 3;
    const warnings = [];
    const m = parseEvent(bad, warnings);
    expect(m.team1Wins).toBeNull();
    expect(warnings).toHaveLength(1);
  });
});

describe('fetchMatches', () => {
  const page = (evts, older, newer) => ({
    ok: true,
    json: async () => ({ data: { schedule: { pages: { older, newer }, events: evts } } }),
  });

  it('sends the key, follows newer pages, and filters by since', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ token: new URL(url).searchParams.get('pageToken'), key: init.headers['x-api-key'] });
      const token = new URL(url).searchParams.get('pageToken');
      if (token === 'N1') return page([openBo5], 'O', null);
      return page([completedBo1, tbdBo5], 'O', 'N1');
    };

    const matches = await fetchMatches({
      leagueId: 'L',
      apiKey: 'KEY',
      since: '2026-01-01T00:00:00Z',
      fetchImpl,
    });

    expect(calls.map((c) => c.token)).toEqual([null, 'N1']); // no older: already before `since`
    expect(calls.every((c) => c.key === 'KEY')).toBe(true);
    expect(matches.map((m) => m.id).sort()).toEqual(
      [parseEvent(tbdBo5).id, parseEvent(openBo5).id].sort(),
    );
  });

  it('follows older pages while they still reach `since`', async () => {
    const fetchImpl = async (url) => {
      const token = new URL(url).searchParams.get('pageToken');
      if (token === 'O1') return page([completedBo1], 'O2', null); // 2025: stop after this
      return page([openBo5], 'O1', null);
    };
    const matches = await fetchMatches({
      leagueId: 'L',
      apiKey: 'K',
      since: '2025-01-01T00:00:00Z',
      fetchImpl,
    });
    expect(matches).toHaveLength(2);
  });

  it('throws on an HTTP error or an unexpected shape', async () => {
    const base = { leagueId: 'L', apiKey: 'K', since: '2026-01-01T00:00:00Z' };
    await expect(
      fetchMatches({ ...base, fetchImpl: async () => ({ ok: false, status: 403 }) }),
    ).rejects.toThrow('403');
    await expect(
      fetchMatches({ ...base, fetchImpl: async () => ({ ok: true, json: async () => ({}) }) }),
    ).rejects.toThrow('Unexpected');
  });
});

describe('syncMatches', () => {
  let db;

  const parsed = () => events.map((e) => parseEvent(e));
  const row = (id) => db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  const addUser = (name) =>
    db.prepare('INSERT INTO users (name, pin_hash) VALUES (?, ?)').run(name, 'x').lastInsertRowid;

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('inserts new matches', () => {
    const s = syncMatches(db, parsed(), silent);
    expect(s).toMatchObject({ fetched: 4, inserted: 4, updated: 0 });
    expect(row('115660588583171786')).toMatchObject({ team1: 'Cloud9 Kia', best_of: 5 });
  });

  it('stores team logos and updates them when they change', () => {
    syncMatches(db, parsed(), silent);
    const id = parseEvent(completedBo1).id;
    expect(row(id)).toMatchObject({
      team1_image: 'https://static.lolesports.com/teams/1670542079678_vks.png',
    });

    const s = syncMatches(db, [{ ...parseEvent(completedBo1), team1Image: 'https://x/new.png' }], silent);
    expect(s.updated).toBe(1);
    expect(row(id).team1_image).toBe('https://x/new.png');
  });

  it('is idempotent: a second run changes nothing', () => {
    syncMatches(db, parsed(), silent);
    const before = db.prepare('SELECT * FROM matches ORDER BY id').all();
    const s = syncMatches(db, parsed(), silent);
    expect(s).toMatchObject({ inserted: 0, updated: 0, scored: 0 });
    expect(db.prepare('SELECT * FROM matches ORDER BY id').all()).toEqual(before);
  });

  it('scores picks once a match completes, and only once', () => {
    const open = { ...parseEvent(completedBo1), state: 'unstarted', team1Wins: null, team2Wins: null };
    open.startTime = new Date(Date.now() + 86400000).toISOString();
    syncMatches(db, [open], silent);

    const alice = addUser('Alice');
    const bob = addUser('Bob');
    const pick = db.prepare(
      'INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2) VALUES (?, ?, ?, ?)',
    );
    pick.run(alice, open.id, 0, 1); // exact (result 0-1)
    pick.run(bob, open.id, 1, 0); // wrong

    const s = syncMatches(db, [{ ...parseEvent(completedBo1), startTime: open.startTime }], silent);
    expect(s.scored).toBe(1);
    const points = db.prepare('SELECT user_id, points FROM predictions ORDER BY user_id').all();
    expect(points).toEqual([
      { user_id: alice, points: 3 },
      { user_id: bob, points: 0 },
    ]);

    const again = syncMatches(db, [{ ...parseEvent(completedBo1), startTime: open.startTime }], silent);
    expect(again.scored).toBe(0);
  });

  it('never overwrites a manual override', () => {
    syncMatches(db, parsed(), silent);
    const id = parseEvent(completedBo1).id;
    db.prepare('UPDATE matches SET team1_wins = 1, team2_wins = 0, manual_override = 1 WHERE id = ?').run(id);

    const s = syncMatches(db, parsed(), silent);
    expect(s.skipped).toBe(1);
    expect(row(id)).toMatchObject({ team1_wins: 1, team2_wins: 0 });
  });

  it('keeps the old teams once picks exist, but fills in TBD teams', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const base = { ...parseEvent(openBo5), startTime: future };
    syncMatches(db, [{ ...base, team1: null, team2: null, team1Code: null, team2Code: null }], silent);
    // TBD -> known: allowed
    syncMatches(db, [base], silent);
    expect(row(base.id)).toMatchObject({ team1: 'Cloud9 Kia', team2: 'Karmine Corp' });

    const alice = addUser('Alice');
    db.prepare(
      'INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2) VALUES (?, ?, 3, 0)',
    ).run(alice, base.id);

    // Known -> swapped teams while picks exist: refused
    const swapped = { ...base, team1: 'Karmine Corp', team1Code: 'KC', team2: 'Cloud9 Kia', team2Code: 'C9' };
    syncMatches(db, [swapped], silent);
    expect(row(base.id)).toMatchObject({ team1: 'Cloud9 Kia', team1_code: 'C9' });
  });

  it('does not reopen a started match when the API moves its start time later', () => {
    const past = new Date(Date.now() - 3600000).toISOString();
    const later = new Date(Date.now() + 86400000).toISOString();
    const m = { ...parseEvent(openBo5), startTime: past };
    syncMatches(db, [m], silent);
    syncMatches(db, [{ ...m, startTime: later }], silent);

    const r = row(m.id);
    expect(r.start_time).toBe(later);
    expect(r.locked_at).not.toBeNull();
  });
});

describe('planSync', () => {
  const NOW = new Date('2026-10-15T10:00:00Z');
  const H = 3_600_000;
  const M = 60_000;
  let db;

  const add = (id, offsetMs, state = 'unstarted') =>
    db
      .prepare(
        `INSERT INTO matches (id, team1, team2, best_of, start_time, state)
         VALUES (?, 'T1', 'G2', 3, ?, ?)`,
      )
      .run(id, new Date(NOW.getTime() + offsetMs).toISOString(), state);

  beforeEach(() => {
    db = openDb(':memory:');
  });
  afterEach(() => db.close());

  it('only re-checks the schedule every few hours when nothing is upcoming', () => {
    expect(planSync(db, NOW)).toEqual({ phase: 'none', inWindow: false, delayMs: MAX_SLEEP_MS });
  });

  it('sleeps until the window opens when the next match is far away', () => {
    add('m', 5 * H); // window opens 3h before the start, so in 2h
    expect(planSync(db, NOW)).toEqual({ phase: 'waiting', inWindow: false, delayMs: 2 * H });
  });

  it('caps a long sleep', () => {
    add('m', 3 * 24 * H);
    expect(planSync(db, NOW)).toEqual({ phase: 'waiting', inWindow: false, delayMs: MAX_SLEEP_MS });
  });

  it('polls every 10 minutes in the hours before a match', () => {
    add('m', 2 * H);
    expect(planSync(db, NOW)).toEqual({ phase: 'pre', inWindow: true, delayMs: PRE_INTERVAL_MS });
  });

  it('wakes exactly at the start time so live polling begins on time', () => {
    add('m', 4 * M);
    expect(planSync(db, NOW).delayMs).toBe(4 * M);
  });

  it('polls more often while a match is live', () => {
    add('m', -30 * M);
    expect(planSync(db, NOW)).toEqual({ phase: 'live', inWindow: true, delayMs: LIVE_INTERVAL_MS });
    expect(LIVE_INTERVAL_MS).toBeLessThan(PRE_INTERVAL_MS);
  });

  it('treats an in-progress match the same as a started one', () => {
    add('m', -30 * M, 'inProgress');
    expect(planSync(db, NOW).phase).toBe('live');
  });

  it('prefers live polling when a match is live and another is upcoming', () => {
    add('live', -10 * M);
    add('next', 1 * H);
    expect(planSync(db, NOW).phase).toBe('live');
  });

  it('gives up on a match that started long ago and never completed', () => {
    add('stuck', -9 * H);
    expect(planSync(db, NOW).phase).toBe('none');
  });

  it('ignores completed matches', () => {
    add('done', -1 * H, 'completed');
    add('done-soon', 1 * H, 'completed');
    expect(planSync(db, NOW).phase).toBe('none');
  });
});

describe('sync loop timing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('stays quiet until a few hours before a match, then polls, then speeds up when live', async () => {
    const db = openDb(':memory:');
    db.prepare(
      `INSERT INTO matches (id, team1, team2, best_of, start_time)
       VALUES ('m', 'T1', 'G2', 3, '2026-10-15T15:00:00.000Z')`,
    ).run();

    let calls = 0;
    const sync = createSync({
      db,
      log: silent,
      fetchMatches: async () => {
        calls++;
        return [];
      },
    });
    const goTo = (iso) => vi.advanceTimersByTimeAsync(Date.parse(iso) - Date.now());
    const callsBetween = async (from, to) => {
      await goTo(from);
      const before = calls;
      await goTo(to);
      return calls - before;
    };

    sync.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1); // the sync at startup

    await goTo('2026-10-15T11:50:00Z');
    expect(calls).toBe(1); // 5h to go: nothing yet

    await goTo('2026-10-15T12:01:00Z');
    expect(calls).toBe(2); // window opened at 12:00

    // Before the match: every 10 minutes.
    expect(await callsBetween('2026-10-15T13:00:00Z', '2026-10-15T13:30:00Z')).toBe(3);

    // The match is live from 15:00: every 3 minutes.
    expect(await callsBetween('2026-10-15T15:30:00Z', '2026-10-15T16:00:00Z')).toBe(10);

    // Once finished, it goes quiet again.
    db.prepare("UPDATE matches SET state = 'completed'").run();
    await goTo('2026-10-15T16:05:00Z'); // one last check sees there is nothing upcoming
    expect(await callsBetween('2026-10-15T16:10:00Z', '2026-10-15T20:00:00Z')).toBe(0);

    sync.stop();
    db.close();
  });
});

describe('createSync', () => {
  it('shares one run between concurrent callers', async () => {
    const db = openDb(':memory:');
    let calls = 0;
    const sync = createSync({
      db,
      log: silent,
      fetchMatches: async () => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        return [];
      },
    });
    await Promise.all([sync.runNow(), sync.runNow()]);
    expect(calls).toBe(1);
    db.close();
  });
});

describe('POST /api/admin/sync', () => {
  const make = async (runSync) => {
    const db = openDb(':memory:');
    const app = await buildApp({
      db,
      config: { inviteCode: 'c', adminToken: 'tok', authRateLimitMax: 100, logger: false, runSync },
    });
    return { app, db };
  };
  const post = (app) =>
    app.inject({ method: 'POST', url: '/api/admin/sync', headers: { 'x-admin-token': 'tok' }, payload: {} });

  it('returns 503 when sync is not configured', async () => {
    const { app, db } = await make(null);
    expect((await post(app)).statusCode).toBe(503);
    await app.close();
    db.close();
  });

  it('returns the summary, or 502 when the API fails', async () => {
    const ok = await make(async () => ({ inserted: 2, updated: 0, scored: 0 }));
    const res = await post(ok.app);
    expect(res.statusCode).toBe(200);
    expect(res.json().inserted).toBe(2);
    await ok.app.close();
    ok.db.close();

    const bad = await make(async () => {
      throw new Error('LoL Esports API responded 403');
    });
    const failed = await post(bad.app);
    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toContain('403');
    await bad.app.close();
    bad.db.close();
  });
});
