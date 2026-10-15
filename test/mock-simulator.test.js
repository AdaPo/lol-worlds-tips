import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb } from '../server/db.js';
import { FINISH_AFTER_MS, advanceMockMatches } from '../scripts/mock-simulator.js';

describe('mock match clock', () => {
  const START = Date.parse('2026-10-15T12:00:00.000Z');
  const SIM = { 'mock-soon': [1, 0] };
  let db;

  const match = () => db.prepare("SELECT * FROM matches WHERE id = 'mock-soon'").get();
  const points = () =>
    db
      .prepare('SELECT u.name, p.points FROM predictions p JOIN users u ON u.id = p.user_id ORDER BY u.name')
      .all()
      .map((r) => [r.name, r.points]);

  beforeEach(() => {
    db = openDb(':memory:');
    db.prepare(
      `INSERT INTO matches (id, team1, team2, best_of, start_time)
       VALUES ('mock-soon', 'Cloud9 Kia', 'Karmine Corp', 1, ?)`,
    ).run(new Date(START).toISOString());
    for (const name of ['Alice', 'Bob']) {
      db.prepare("INSERT INTO users (name, pin_hash) VALUES (?, 'x')").run(name);
    }
    const pick = db.prepare(
      'INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2) VALUES (?, ?, ?, ?)',
    );
    pick.run(1, 'mock-soon', 1, 0); // Alice: exact
    pick.run(2, 'mock-soon', 0, 1); // Bob: wrong
  });
  afterEach(() => db.close());

  it('does nothing before the start time', () => {
    expect(advanceMockMatches(db, START - 1000, SIM)).toEqual([]);
    expect(match().state).toBe('unstarted');
  });

  it('goes live at the start time and locks the match', () => {
    expect(advanceMockMatches(db, START, SIM)).toEqual(['mock-soon started (live)']);
    expect(match().state).toBe('inProgress');
    expect(match().locked_at).not.toBeNull();
    expect(match().team1_wins).toBeNull();
  });

  it('stays live until a minute has passed', () => {
    advanceMockMatches(db, START, SIM);
    expect(advanceMockMatches(db, START + FINISH_AFTER_MS - 1, SIM)).toEqual([]);
    expect(match().state).toBe('inProgress');
  });

  it('finishes one minute after the start, with the result and scored picks', () => {
    advanceMockMatches(db, START, SIM);
    const changes = advanceMockMatches(db, START + FINISH_AFTER_MS, SIM);

    expect(changes).toEqual(['mock-soon finished 1-0, 2 picks scored']);
    expect(match()).toMatchObject({ state: 'completed', team1_wins: 1, team2_wins: 0 });
    expect(match().scored_at).not.toBeNull();
    expect(points()).toEqual([
      ['Alice', 3],
      ['Bob', 0],
    ]);
  });

  it('can jump straight to finished if the app was not running at the start', () => {
    advanceMockMatches(db, START + 5 * FINISH_AFTER_MS, SIM);
    expect(match().state).toBe('completed');
    expect(points()).toEqual([
      ['Alice', 3],
      ['Bob', 0],
    ]);
  });

  it('does not repeat itself once finished', () => {
    advanceMockMatches(db, START + FINISH_AFTER_MS, SIM);
    expect(advanceMockMatches(db, START + 2 * FINISH_AFTER_MS, SIM)).toEqual([]);
  });

  it('ignores matches that are not listed', () => {
    expect(advanceMockMatches(db, START + FINISH_AFTER_MS, {})).toEqual([]);
    expect(match().state).toBe('unstarted');
  });
});
