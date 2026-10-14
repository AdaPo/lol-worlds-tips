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
        value: '3',
      });
      expect(() => upgraded.prepare('SELECT team1_image, team2_image FROM matches').all()).not.toThrow();
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op when the database is already current', () => {
    const db = openDb(':memory:');
    const version = () =>
      db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get().value;
    expect(version()).toBe('3');
    db.close();
  });
});
