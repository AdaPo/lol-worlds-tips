import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../server/db.js';

// scripts/seed-mock.js builds a database of fake players and matches and fails
// (non-zero exit) if the real scoring disagrees with its hand-computed points.
describe('mock data seed', () => {
  it('produces the leaderboard worked out by hand', () => {
    const dir = mkdtempSync(join(tmpdir(), 'worlds-mock-'));
    try {
      const out = execFileSync(
        process.execPath,
        ['scripts/seed-mock.js', join(dir, 'mock.db')],
        { encoding: 'utf8' },
      );
      expect(out).toContain('Scoring check passed.');
      expect(out).toMatch(/1\. Alice\s+8 pts/);
      expect(out).toMatch(/5\. Karel\s+2 pts/);
      expect(out).not.toContain('Organizer  '); // hidden from the leaderboard
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('can restart the open-to-locked countdown without rebuilding the data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'worlds-mock-'));
    const dbPath = join(dir, 'mock.db');
    try {
      execFileSync(process.execPath, ['scripts/seed-mock.js', dbPath], { encoding: 'utf8' });

      const db = openDb(dbPath);
      // Pretend it already started and locked, then restart it for 5 minutes.
      db.prepare("UPDATE matches SET locked_at = ?, start_time = ? WHERE id = 'mock-soon'").run(
        new Date().toISOString(),
        new Date(Date.now() - 60_000).toISOString(),
      );
      db.close();

      execFileSync(process.execPath, ['scripts/mock-soon.js', '5', dbPath], { encoding: 'utf8' });

      const after = openDb(dbPath);
      const m = after.prepare("SELECT * FROM matches WHERE id = 'mock-soon'").get();
      const inMinutes = (Date.parse(m.start_time) - Date.now()) / 60_000;
      expect(inMinutes).toBeGreaterThan(4.5);
      expect(inMinutes).toBeLessThanOrEqual(5);
      expect(m.locked_at).toBeNull();
      expect(m.state).toBe('unstarted');
      expect(after.prepare('SELECT COUNT(*) AS n FROM users').get().n).toBe(8); // data kept
      after.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses to write to a database that is not named mock', () => {
    expect(() =>
      execFileSync(process.execPath, ['scripts/seed-mock.js', './data/app.db'], {
        encoding: 'utf8',
        stdio: 'pipe',
      }),
    ).toThrow(/must contain "mock"/);
  });
});
