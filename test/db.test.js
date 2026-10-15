import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../server/db.js';

describe('migrations', () => {
  it('upgrades an existing version-2 database and keeps admins hidden', () => {
    const dir = mkdtempSync(join(tmpdir(), 'worlds-db-'));
    const path = join(dir, 'app.db');
    try {
      // Build a current database, then roll it back to what version 2 looked like.
      const first = openDb(path);
      first.exec(`
        ALTER TABLE users DROP COLUMN hidden;
        ALTER TABLE matches DROP COLUMN team1_image;
        ALTER TABLE matches DROP COLUMN team2_image;
        UPDATE settings SET value = '2' WHERE key = 'schema_version';
        INSERT INTO users (name, pin_hash, is_admin) VALUES ('Boss', 'x', 1);
        INSERT INTO users (name, pin_hash) VALUES ('Pal', 'x');
      `);
      first.close();

      const upgraded = openDb(path);
      expect(
        upgraded.prepare('SELECT name, is_admin, hidden FROM users ORDER BY name').all(),
      ).toEqual([
        { name: 'Boss', is_admin: 1, hidden: 1 },
        { name: 'Pal', is_admin: 0, hidden: 0 },
      ]);
      expect(upgraded.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get()).toEqual({
        value: '4',
      });
      expect(() => upgraded.prepare('SELECT team1_image, team2_image FROM matches').all()).not.toThrow();
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('corrects stored best-of-1 points when upgrading from the old scoring rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'worlds-db-'));
    const path = join(dir, 'app.db');
    try {
      const first = openDb(path);
      first.exec(`
        UPDATE settings SET value = '3' WHERE key = 'schema_version';
        INSERT INTO users (name, pin_hash) VALUES ('Alice', 'x'), ('Bob', 'x');
        INSERT INTO matches (id, best_of, start_time, state, team1_wins, team2_wins)
          VALUES ('bo1', 1, '2026-10-01T10:00:00.000Z', 'completed', 1, 0),
                 ('bo1-open', 1, '2026-12-01T10:00:00.000Z', 'unstarted', NULL, NULL),
                 ('bo3', 3, '2026-10-02T10:00:00.000Z', 'completed', 2, 1);
        -- Stored under the old rule: the right best-of-1 winner got 3.
        INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2, points) VALUES
          (1, 'bo1', 1, 0, 3),
          (2, 'bo1', 0, 1, 0),
          (1, 'bo1-open', 1, 0, NULL),
          (1, 'bo3', 2, 1, 3);
      `);
      first.close();

      const upgraded = openDb(path);
      const points = (user, match) =>
        upgraded
          .prepare('SELECT points FROM predictions WHERE user_id = ? AND match_id = ?')
          .get(user, match).points;
      expect(points(1, 'bo1')).toBe(1); // right winner, best-of-1
      expect(points(2, 'bo1')).toBe(0); // wrong winner
      expect(points(1, 'bo1-open')).toBeNull(); // not scored yet: untouched
      expect(points(1, 'bo3')).toBe(3); // best-of-3 exact score keeps 3
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op when the database is already current', () => {
    const db = openDb(':memory:');
    const version = () =>
      db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value;
    expect(version()).toBe('4');
    db.close();
  });
});
