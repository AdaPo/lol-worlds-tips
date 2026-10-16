import { isOpen, isUndecided } from './match.js';

const isFinished = (m) => m.state === 'completed';

// Which matches the list shows.
//   filter         'all' | 'open' | 'finished'  (the three tabs)
//   hideFinished   switch, only applies on the "All" tab (the other tabs are
//                  about finished matches or can't contain them)
//   hideUndecided  switch: leave out matches where no team is known yet
export function visibleMatches(matches, { filter, hideFinished, hideUndecided }, now) {
  let list = matches;
  if (filter === 'open') list = list.filter((m) => isOpen(m, now));
  if (filter === 'finished') list = list.filter(isFinished);

  return list.filter((m) => {
    if (hideUndecided && isUndecided(m)) return false;
    if (hideFinished && filter === 'all' && isFinished(m)) return false;
    return true;
  });
}

// How many matches each switch controls (shown next to the switch).
export function switchCounts(matches) {
  return {
    finished: matches.filter(isFinished).length,
    undecided: matches.filter(isUndecided).length,
  };
}
