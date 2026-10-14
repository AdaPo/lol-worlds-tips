import { lockStartedMatches } from '../matches.js';
import { scoreMatch } from './scoring.js';

const IDLE_MS = 5 * 60 * 1000;
const ACTIVE_MS = 60 * 1000;

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
      const finished = row.state === 'completed' && row.team1_wins !== null;
      const current = getMatch.get(m.id);

      if (!current) {
        insert.run(row);
        summary.inserted++;
        if (finished) toScore.push(m.id);
        continue;
      }
      if (current.manual_override) {
        summary.skipped++;
        continue;
      }

      // Picks are stored by team position, so never swap teams under them.
      const teamsKnown = current.team1 !== null && current.team2 !== null;
      const teamsDiffer = current.team1 !== row.team1 || current.team2 !== row.team2;
      if (teamsKnown && teamsDiffer && hasPicks.get(m.id)) {
        log.warn?.(`Match ${m.id}: API teams changed after picks were made; keeping the old teams`);
        Object.assign(row, {
          team1: current.team1,
          team2: current.team2,
          team1_code: current.team1_code,
          team2_code: current.team2_code,
          team1_image: current.team1_image,
          team2_image: current.team2_image,
        });
      }

      const changed = FIELDS.some((f) => current[f] !== row[f]);
      if (changed) {
        update.run(row);
        summary.updated++;
      }
      if (finished && (changed || current.scored_at === null)) toScore.push(m.id);
    }
  })();

  lockStartedMatches(db);
  for (const id of toScore) {
    scoreMatch(db, id);
    summary.scored++;
  }
  return summary;
}

// Runs syncs on a timer: every minute while a match is live or about to
// start, otherwise every five minutes. Failures are logged, never thrown.
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

  function nextDelay() {
    const now = Date.now();
    const soon = new Date(now + 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 12 * 60 * 60 * 1000).toISOString();
    const active = db
      .prepare(
        `SELECT 1 FROM matches
         WHERE state != 'completed' AND start_time <= ? AND start_time >= ? LIMIT 1`,
      )
      .get(soon, recent);
    return active ? ACTIVE_MS : IDLE_MS;
  }

  async function tick() {
    try {
      await runNow();
    } catch (e) {
      log.error?.(`sync failed: ${e.message}`);
    }
    if (!stopped) timer = setTimeout(tick, nextDelay());
  }

  return {
    runNow,
    start() {
      stopped = false;
      tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
