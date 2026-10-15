import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Ordered list of migrations; the index + 1 is the schema version.
const migrations = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    pin_hash      TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE matches (
    id              TEXT PRIMARY KEY,
    stage           TEXT,
    team1           TEXT,
    team2           TEXT,
    team1_code      TEXT,
    team2_code      TEXT,
    best_of         INTEGER NOT NULL,
    start_time      TEXT NOT NULL,
    locked_at       TEXT,
    state           TEXT NOT NULL DEFAULT 'unstarted',
    team1_wins      INTEGER,
    team2_wins      INTEGER,
    manual_override INTEGER NOT NULL DEFAULT 0,
    scored_at       TEXT,
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE predictions (
    user_id       INTEGER NOT NULL REFERENCES users(id),
    match_id      TEXT NOT NULL REFERENCES matches(id),
    pred_team1    INTEGER NOT NULL,
    pred_team2    INTEGER NOT NULL,
    points        INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, match_id)
  );

  CREATE TABLE sessions (
    token         TEXT PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id),
    expires_at    TEXT NOT NULL
  );

  CREATE INDEX idx_matches_start ON matches(start_time);
  CREATE INDEX idx_predictions_match ON predictions(match_id);
  `,
  `ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0`,
  // hidden: left out of the leaderboard (separate from admin). Existing admins
  // stay hidden, as before this column existed.
  `
  ALTER TABLE users ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
  UPDATE users SET hidden = is_admin;
  ALTER TABLE matches ADD COLUMN team1_image TEXT;
  ALTER TABLE matches ADD COLUMN team2_image TEXT;
  `,
  // Best-of-1 scoring changed: a correct winner earns 1 point (not 3). Fix the
  // points already stored for finished best-of-1 matches.
  `
  UPDATE predictions
  SET points = CASE
    WHEN (pred_team1 > pred_team2) =
         ((SELECT team1_wins FROM matches m WHERE m.id = predictions.match_id) >
          (SELECT team2_wins FROM matches m WHERE m.id = predictions.match_id))
    THEN 1 ELSE 0 END
  WHERE points IS NOT NULL
    AND match_id IN (
      SELECT id FROM matches
      WHERE best_of = 1 AND state = 'completed' AND team1_wins IS NOT NULL
    );
  `,
];

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get();
  const current = row ? Number(row.value) : 0;

  const apply = db.transaction((version) => {
    db.exec(migrations[version]);
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('schema_version', ?) " +
        'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(String(version + 1));
  });

  for (let v = current; v < migrations.length; v++) apply(v);
}
