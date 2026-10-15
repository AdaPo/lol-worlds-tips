import { describe, expect, it } from 'vitest';
import { groupByDay } from '../web/src/lib/groups.js';

// Keys on the UTC date, like the real helper does for the viewer's local date.
const keyOf = (iso) => iso.slice(0, 10);
const labelOf = (iso) => `day ${iso.slice(8, 10)}`;

const m = (id, iso, state = 'unstarted') => ({ id, startTime: iso, state });
const group = (matches) => groupByDay(matches, keyOf, labelOf);

describe('groupByDay', () => {
  it('never produces the same day twice (a finished and an upcoming match on one day)', () => {
    // The page used to crash on this: a finished match today, an upcoming match
    // today, and another upcoming match tomorrow.
    const groups = group([
      m('done-today', '2026-10-15T08:00:00Z', 'completed'),
      m('next-today', '2026-10-15T18:00:00Z'),
      m('tomorrow', '2026-10-16T18:00:00Z'),
    ]);

    const keys = groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('puts a day’s upcoming matches before its finished ones', () => {
    const [today] = group([
      m('done', '2026-10-15T08:00:00Z', 'completed'),
      m('later', '2026-10-15T20:00:00Z'),
      m('soon', '2026-10-15T14:00:00Z'),
    ]);
    expect(today.items.map((x) => x.id)).toEqual(['soon', 'later', 'done']);
  });

  it('lists days with matches to play first, soonest first, then finished days latest first', () => {
    const groups = group([
      m('old', '2026-10-12T10:00:00Z', 'completed'),
      m('yesterday', '2026-10-14T10:00:00Z', 'completed'),
      m('in-3-days', '2026-10-18T10:00:00Z'),
      m('tomorrow', '2026-10-16T10:00:00Z'),
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      '2026-10-16',
      '2026-10-18',
      '2026-10-14',
      '2026-10-12',
    ]);
  });

  it('shows the latest finished match first within a finished day', () => {
    const [day] = group([
      m('a', '2026-10-14T08:00:00Z', 'completed'),
      m('c', '2026-10-14T16:00:00Z', 'completed'),
      m('b', '2026-10-14T12:00:00Z', 'completed'),
    ]);
    expect(day.items.map((x) => x.id)).toEqual(['c', 'b', 'a']);
  });

  it('treats live matches as still to play', () => {
    const groups = group([
      m('done', '2026-10-15T08:00:00Z', 'completed'),
      m('live', '2026-10-15T12:00:00Z', 'inProgress'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((x) => x.id)).toEqual(['live', 'done']);
  });

  it('copes with no matches and carries the heading label', () => {
    expect(group([])).toEqual([]);
    expect(group([m('x', '2026-10-15T10:00:00Z')])[0].label).toBe('day 15');
  });

  it('keeps every match exactly once', () => {
    const input = Array.from({ length: 40 }, (_, i) =>
      m(`m${i}`, `2026-10-${String(10 + (i % 7)).padStart(2, '0')}T${String(i % 24).padStart(2, '0')}:00:00Z`, i % 3 ? 'completed' : 'unstarted'),
    );
    const groups = group(input);
    const ids = groups.flatMap((g) => g.items.map((x) => x.id));
    expect(ids.sort()).toEqual(input.map((x) => x.id).sort());
    expect(new Set(groups.map((g) => g.key)).size).toBe(groups.length);
  });
});
