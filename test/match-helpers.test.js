import { describe, expect, it } from 'vitest';
import { isOpen, isTbd, isUndecided, validScores } from '../web/src/lib/match.js';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const future = '2026-10-16T12:00:00Z';
const past = '2026-10-14T12:00:00Z';

describe('isUndecided', () => {
  it('is true only when no team is known', () => {
    expect(isUndecided({ team1: null, team2: null })).toBe(true);
    expect(isUndecided({ team1: 'TBD', team2: ' tbd ' })).toBe(true);
    expect(isUndecided({ team1: 'T1', team2: null })).toBe(false);
    expect(isUndecided({ team1: null, team2: 'G2' })).toBe(false);
    expect(isUndecided({ team1: 'T1', team2: 'G2' })).toBe(false);
  });
});

describe('isOpen', () => {
  const base = { team1: 'T1', team2: 'G2', locked: false, startTime: future };

  it('needs both teams, no lock, and a future start', () => {
    expect(isOpen(base, NOW)).toBe(true);
    expect(isOpen({ ...base, team2: null }, NOW)).toBe(false);
    expect(isOpen({ ...base, locked: true }, NOW)).toBe(false);
    expect(isOpen({ ...base, startTime: past }, NOW)).toBe(false);
  });
});

describe('validScores', () => {
  it('lists the valid scores per best-of, split by winner', () => {
    expect(validScores(1)).toEqual({ left: [[1, 0]], right: [[0, 1]] });
    expect(validScores(3)).toEqual({
      left: [
        [2, 0],
        [2, 1],
      ],
      right: [
        [1, 2],
        [0, 2],
      ],
    });
    expect(validScores(5).left).toEqual([
      [3, 0],
      [3, 1],
      [3, 2],
    ]);
    expect(validScores(5).right).toEqual([
      [2, 3],
      [1, 3],
      [0, 3],
    ]);
  });
});

describe('isTbd', () => {
  it('treats empty and TBD as undecided', () => {
    expect(isTbd(null)).toBe(true);
    expect(isTbd('TBD')).toBe(true);
    expect(isTbd('T1')).toBe(false);
  });
});
