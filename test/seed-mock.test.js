import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
      expect(out).toMatch(/1\. Alice\s+10 pts/);
      expect(out).toMatch(/4\. Karel\s+4 pts/);
      expect(out).not.toContain('Organizer  '); // hidden from the leaderboard
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
