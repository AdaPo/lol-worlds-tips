import { describe, expect, it } from 'vitest';
import { formatCountdown } from '../web/src/lib/duration.js';

const en = { d: 'd', h: 'h', m: 'm', s: 's' };
const cs = { d: 'd', h: 'h', m: 'min', s: 's' };

const secs = (d, h, m, s) => d * 86400 + h * 3600 + m * 60 + s;

describe('formatCountdown', () => {
  it('shows days, hours and minutes when over a day', () => {
    expect(formatCountdown(secs(2, 3, 12, 40), en)).toBe('2d 3h 12m');
    expect(formatCountdown(secs(1, 0, 0, 0), en)).toBe('1d 0h 0m');
    expect(formatCountdown(secs(1, 0, 5, 59), en)).toBe('1d 0h 5m');
  });

  it('shows hours and minutes when over an hour', () => {
    expect(formatCountdown(secs(0, 3, 12, 40), en)).toBe('3h 12m');
    expect(formatCountdown(secs(0, 23, 59, 59), en)).toBe('23h 59m');
    expect(formatCountdown(secs(0, 1, 0, 0), en)).toBe('1h 0m');
  });

  it('shows minutes and padded seconds under an hour', () => {
    expect(formatCountdown(secs(0, 0, 12, 5), en)).toBe('12m 05s');
    expect(formatCountdown(secs(0, 0, 0, 9), en)).toBe('0m 09s');
    expect(formatCountdown(secs(0, 0, 59, 59), en)).toBe('59m 59s');
  });

  it('uses the Czech unit labels', () => {
    expect(formatCountdown(secs(2, 3, 12, 0), cs)).toBe('2d 3h 12min');
    expect(formatCountdown(secs(0, 0, 4, 7), cs)).toBe('4min 07s');
  });
});
