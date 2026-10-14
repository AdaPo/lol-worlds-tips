import { describe, expect, it } from 'vitest';
import { EXACT_POINTS, WINNER_POINTS } from '../server/services/scoring.js';
import * as shown from '../web/src/lib/rules.js';

describe('scoring help matches the server rules', () => {
  it('shows the same point values the server awards', () => {
    expect(shown.EXACT_POINTS).toBe(EXACT_POINTS);
    expect(shown.WINNER_POINTS).toBe(WINNER_POINTS);
  });
});
