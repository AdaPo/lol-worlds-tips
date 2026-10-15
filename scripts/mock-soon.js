// Restarts the countdown of the "mock-soon" match in the mock database, so you
// can watch a match go from open to locked again without re-seeding.
//
//   npm run mock:soon            starts in 2 minutes
//   npm run mock:soon -- 0.5     starts in 30 seconds
//
// The running app picks the change up within its 30 second refresh (or reload).
import { basename } from 'node:path';
import { openDb } from '../server/db.js';

const minutes = Number(process.argv[2] ?? 2);
const path = process.argv[3] ?? './data/mock.db';

if (!basename(path).includes('mock')) {
  console.error(`Refusing to touch "${path}": the file name must contain "mock".`);
  process.exit(1);
}
if (!Number.isFinite(minutes) || minutes < 0) {
  console.error('Usage: npm run mock:soon -- [minutes]   (e.g. 2 or 0.5)');
  process.exit(1);
}

const db = openDb(path);
const start = new Date(Date.now() + minutes * 60_000).toISOString();
// Back to an untouched open match: no result, no points, not locked.
const reset = db.transaction(() => {
  db.prepare("UPDATE predictions SET points = NULL WHERE match_id = 'mock-soon'").run();
  return db
    .prepare(
      `UPDATE matches SET start_time = ?, locked_at = NULL, state = 'unstarted',
              team1_wins = NULL, team2_wins = NULL, scored_at = NULL
       WHERE id = 'mock-soon'`,
    )
    .run(start).changes;
});
const changes = reset();
db.close();

if (changes === 0) {
  console.error('No "mock-soon" match found. Run: npm run seed:mock');
  process.exit(1);
}
console.log(`mock-soon (C9 vs KC) now starts at ${start} (in ${minutes} min).`);
