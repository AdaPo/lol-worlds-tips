import { describe, expect, it } from 'vitest';
import { switchCounts, visibleMatches } from '../web/src/lib/visibility.js';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const future = '2026-10-16T12:00:00Z';
const past = '2026-10-14T12:00:00Z';

const m = (id, over = {}) => ({
  id,
  team1: 'T1',
  team2: 'G2',
  state: 'unstarted',
  locked: false,
  startTime: future,
  ...over,
});

const done = m('done', { state: 'completed', locked: true, startTime: past });
const live = m('live', { state: 'inProgress', locked: true, startTime: past });
const open = m('open');
const half = m('half', { team2: null });
const tbd = m('tbd', { team1: null, team2: null });
const all = [done, live, open, half, tbd];

const ids = (list) => list.map((x) => x.id);
const view = (filter, hideFinished, hideUndecided) =>
  ids(visibleMatches(all, { filter, hideFinished, hideUndecided }, NOW));

describe('visibleMatches', () => {
  it('shows everything on the All tab with both switches off', () => {
    expect(view('all', false, false)).toEqual(['done', 'live', 'open', 'half', 'tbd']);
  });

  it('"hide finished" removes finished matches from the All tab only', () => {
    expect(view('all', true, false)).toEqual(['live', 'open', 'half', 'tbd']);
  });

  it('"hide matches with no known teams" removes only the fully undecided ones', () => {
    expect(view('all', false, true)).toEqual(['done', 'live', 'open', 'half']);
  });

  it('both switches combine', () => {
    expect(view('all', true, true)).toEqual(['live', 'open', 'half']);
  });

  it('never hides finished matches on the Finished tab', () => {
    expect(view('finished', true, false)).toEqual(['done']);
    expect(view('finished', true, true)).toEqual(['done']);
  });

  it('the Open tab lists only matches you can still pick', () => {
    expect(view('open', false, false)).toEqual(['open']);
    expect(view('open', true, true)).toEqual(['open']);
  });

  it('can end up empty when everything is hidden', () => {
    const onlyFinished = [done];
    expect(visibleMatches(onlyFinished, { filter: 'all', hideFinished: true }, NOW)).toEqual([]);
  });
});

describe('switchCounts', () => {
  it('counts the matches each switch controls', () => {
    expect(switchCounts(all)).toEqual({ finished: 1, undecided: 1 });
    expect(switchCounts([])).toEqual({ finished: 0, undecided: 0 });
  });
});
