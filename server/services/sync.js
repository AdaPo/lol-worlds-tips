import { lockStartedMatches } from '../matches.js';
import { scoreMatch } from './scoring.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// When the sync runs. It only polls close to matches:
//   waiting  - no match soon: sleep until PRE_WINDOW before the next one
//   pre      - up to PRE_WINDOW before a match: every PRE_INTERVAL
//   live     - match started, not finished: every LIVE_INTERVAL (a bit faster)
// With no upcoming match known, it re-checks the schedule every MAX_SLEEP.
export const PRE_WINDOW_MS = 3 * HOUR;
export const PRE_INTERVAL_MS = 10 * MIN;
export const LIVE_INTERVAL_MS = 3 * MIN;
export const LIVE_MAX_MS = 8 * HOUR; // stop treating a match as live after this
export const MAX_SLEEP_MS = 6 * HOUR;

// Decides what the sync should do at `now`, from the matches in the database.
//   inWindow: sync now      delayMs: wait this long before looking again
export function planSync(db, now = new Date()) {
  const t = now.getTime();
  const iso = (ms) => new Date(ms).toISOString();

  const live = db
    .prepare(
      `SELECT 1 FROM matches
       WHERE state != 'completed' AND start_time <= ? AND start_time >= ? LIMIT 1`,
    )
    .get(iso(t), iso(t - LIVE_MAX_MS));
  if (live) return { phase: 'live', inWindow: true, delayMs: LIVE_INTERVAL_MS };

  const { start } = db
    .prepare(`SELECT MIN(start_time) AS start FROM matches WHERE state != 'completed' AND start_time > ?`)
    .get(iso(t));
  if (!start) return { phase: 'none', inWindow: false, delayMs: MAX_SLEEP_MS };

  const startMs = Date.parse(start);
  const opensIn = startMs - PRE_WINDOW_MS - t;
  if (opensIn <= 0) {
    // Wake exactly at the start so the faster live polling begins on time.
    const delayMs = Math.max(1000, Math.min(PRE_INTERVAL_MS, startMs - t));
    return { phase: 'pre', inWindow: true, delayMs };
  }
  return { phase: 'waiting', inWindow: false, delayMs: Math.min(opensIn, MAX_SLEEP_MS) };
}

const FIELDS = [
  'stage',
  'team1',
  'team2',
  'team1_code',
  'team2_code',
  'team1_image',
  'team2_image',
  'best_of',
  'start_time',
  'state',
  'team1_wins',
  'team2_wins',
];

const isFinished = (row) => row.state === 'completed' && row.team1_wins !== null;

// The same match with the two sides swapped, score included.
function flipped(row) {
  return {
    team1: row.team2,
    team2: row.team1,
    team1_code: row.team2_code,
    team2_code: row.team1_code,
    team1_image: row.team2_image,
    team2_image: row.team1_image,
    team1_wins: row.team2_wins,
    team2_wins: row.team1_wins,
  };
}

// Writes parsed API matches into the database and scores finished ones.
// Idempotent: running it twice with the same input changes nothing.
export function syncMatches(db, parsed, log = console) {
  const summary = { fetched: parsed.length, inserted: 0, updated: 0, scored: 0, skipped: 0 };
  const toScore = [];

  const getMatch = db.prepare('SELECT * FROM matches WHERE id = ?');
  const hasPicks = db.prepare('SELECT 1 FROM predictions WHERE match_id = ? LIMIT 1');
  const insert = db.prepare(
    `INSERT INTO matches (id, stage, team1, team2, team1_code, team2_code, team1_image,
                          team2_image, best_of, start_time, state, team1_wins, team2_wins)
     VALUES (@id, @stage, @team1, @team2, @team1_code, @team2_code, @team1_image,
             @team2_image, @best_of, @start_time, @state, @team1_wins, @team2_wins)`,
  );
  const update = db.prepare(
    `UPDATE matches SET stage = @stage, team1 = @team1, team2 = @team2,
            team1_code = @team1_code, team2_code = @team2_code,
            team1_image = @team1_image, team2_image = @team2_image, best_of = @best_of,
            start_time = @start_time, state = @state, team1_wins = @team1_wins,
            team2_wins = @team2_wins, updated_at = datetime('now')
     WHERE id = @id`,
  );

  // Lock anything already started BEFORE start times can be moved by this run.
  lockStartedMatches(db);

  db.transaction(() => {
    for (const m of parsed) {
      const row = {
        id: m.id,
        stage: m.stage,
        team1: m.team1,
        team2: m.team2,
        team1_code: m.team1Code,
        team2_code: m.team2Code,
        team1_image: m.team1Image,
        team2_image: m.team2Image,
        best_of: m.bestOf,
        start_time: m.startTime,
        state: m.state,
        team1_wins: m.team1Wins,
        team2_wins: m.team2Wins,
      };
      const current = getMatch.get(m.id);

      if (!current) {
        insert.run(row);
        summary.inserted++;
        if (isFinished(row)) toScore.push(m.id);
        continue;
      }
      if (current.manual_override) {
        summary.skipped++;
        continue;
      }

      // Picks and results are stored by team position (team1 / team2). Once picks
      // exist, a different team order from the API must never be applied as it is.
      const teamsKnown = current.team1 !== null && current.team2 !== null;
      const teamsDiffer = current.team1 !== row.team1 || current.team2 !== row.team2;
      if (teamsKnown && teamsDiffer && hasPicks.get(m.id)) {
        if (current.team1 === row.team2 && current.team2 === row.team1) {
          // The same two teams, listed the other way round: turn the API's record
          // (teams, logos AND the score) around to our order, so the picks and the
          // result still belong to the same teams.
          Object.assign(row, flipped(row));
        } else {
          // Different teams: we can't tell which side a result belongs to. Keep
          // what we have and apply nothing; an admin has to sort it out.
          log.warn?.(
            `Match ${m.id}: the API shows different teams than the ones picked on; ` +
              'keeping the old teams and ignoring this update. Fix it in the Admin tab.',
          );
          Object.assign(row, {
            team1: current.team1,
            team2: current.team2,
            team1_code: current.team1_code,
            team2_code: current.team2_code,
            team1_image: current.team1_image,
            team2_image: current.team2_image,
            state: current.state,
            team1_wins: current.team1_wins,
            team2_wins: current.team2_wins,
          });
        }
      }

      const changed = FIELDS.some((f) => current[f] !== row[f]);
      if (changed) {
        update.run(row);
        summary.updated++;
      }
      if (isFinished(row) && (changed || current.scored_at === null)) toScore.push(m.id);
    }
  })();

  lockStartedMatches(db);
  for (const id of toScore) {
    scoreMatch(db, id);
    summary.scored++;
  }
  return summary;
}

// Runs syncs on a timer, following planSync(). Failures are logged, never thrown.
export function createSync({ db, fetchMatches, log = console }) {
  let inFlight = null;
  let timer = null;
  let stopped = false;

  // Throws on failure. Concurrent calls share one run.
  function runNow() {
    if (!inFlight) {
      inFlight = (async () => {
        const summary = syncMatches(db, await fetchMatches(), log);
        log.info?.(summary, 'sync finished');
        return summary;
      })().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  }

  // `force` is used for the first run after startup.
  async function tick(force = false) {
    const before = planSync(db);
    // Outside a window we only sync when no upcoming match is known at all,
    // so newly published matches are still discovered.
    if (force || before.inWindow || before.phase === 'none') {
      try {
        await runNow();
      } catch (e) {
        log.error?.(`sync failed: ${e.message}`);
      }
    }
    if (stopped) return;
    const next = planSync(db);
    log.info?.({ phase: next.phase, nextCheckInSeconds: Math.round(next.delayMs / 1000) }, 'sync plan');
    timer = setTimeout(tick, next.delayMs);
  }

  return {
    runNow,
    start() {
      stopped = false;
      tick(true);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
