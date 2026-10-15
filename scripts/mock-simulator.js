// Fake match clock for the mock database (used by `npm run dev:mock` only).
//
// For the listed matches it plays what the real sync would do:
//   at the start time        -> state "inProgress"  (the card shows Live)
//   1 minute after the start -> "completed" with a fixed result, picks scored
//
// Nothing here is used in production; the real app gets this from the API sync.
import { openDb } from '../server/db.js';
import { lockStartedMatches } from '../server/matches.js';
import { scoreMatch } from '../server/services/scoring.js';

export const FINISH_AFTER_MS = 60_000;

// match id -> final score [team1Wins, team2Wins]
export const SIMULATED = { 'mock-soon': [1, 0] };

// Applies whatever should have happened by `now`. Safe to call repeatedly.
// Returns a list of human-readable changes (empty when nothing happened).
export function advanceMockMatches(db, now = Date.now(), simulated = SIMULATED) {
  const changes = [];
  const get = db.prepare('SELECT * FROM matches WHERE id = ?');

  for (const [id, [team1Wins, team2Wins]] of Object.entries(simulated)) {
    const m = get.get(id);
    if (!m || m.state === 'completed') continue;

    const start = Date.parse(m.start_time);
    if (now < start) continue;

    if (now >= start + FINISH_AFTER_MS) {
      db.prepare(
        `UPDATE matches SET state = 'completed', team1_wins = ?, team2_wins = ?,
                locked_at = COALESCE(locked_at, ?), updated_at = datetime('now')
         WHERE id = ?`,
      ).run(team1Wins, team2Wins, new Date(now).toISOString(), id);
      const scored = scoreMatch(db, id);
      changes.push(`${id} finished ${team1Wins}-${team2Wins}, ${scored} picks scored`);
    } else if (m.state !== 'inProgress') {
      db.prepare(
        `UPDATE matches SET state = 'inProgress', updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
      lockStartedMatches(db, new Date(now));
      changes.push(`${id} started (live)`);
    }
  }
  return changes;
}

// Runs the clock against a database file until the process exits.
export function startMockSimulator(path, { intervalMs = 2000, log = console.log } = {}) {
  const db = openDb(path);
  const tick = () => {
    try {
      for (const change of advanceMockMatches(db)) log(`[mock clock] ${change}`);
    } catch (error) {
      log(`[mock clock] ${error.message}`);
    }
  };
  tick();
  return setInterval(tick, intervalMs);
}
