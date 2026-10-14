const BEST_OF = [1, 3, 5];

// A series score is valid when exactly one side reached the wins needed
// (ceil(bestOf / 2)) and the other side is below it.
export function isValidScore(team1, team2, bestOf) {
  if (!BEST_OF.includes(bestOf)) return false;
  if (!Number.isInteger(team1) || !Number.isInteger(team2)) return false;
  const needed = Math.ceil(bestOf / 2);
  const hi = Math.max(team1, team2);
  const lo = Math.min(team1, team2);
  return hi === needed && lo >= 0 && lo < needed;
}

export function isValidBestOf(bestOf) {
  return BEST_OF.includes(bestOf);
}

export function isTbd(team) {
  return !team || team.trim().toUpperCase() === 'TBD';
}
