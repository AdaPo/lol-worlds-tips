export function isTbd(team) {
  return !team || team.trim().toUpperCase() === 'TBD';
}

export function hasStarted(match, now) {
  return match.locked || Date.parse(match.startTime) <= now;
}

// Open = teams known and not yet locked. The server is the final judge.
export function isOpen(match, now) {
  return !isTbd(match.team1) && !isTbd(match.team2) && !hasStarted(match, now);
}

// Valid series scores for a best-of, split by which team wins.
// Bo3 -> left: 2-0, 2-1   right: 1-2, 0-2
export function validScores(bestOf) {
  const needed = Math.ceil(bestOf / 2);
  const left = [];
  const right = [];
  for (let lo = 0; lo < needed; lo++) left.push([needed, lo]);
  for (let lo = needed - 1; lo >= 0; lo--) right.push([lo, needed]);
  return { left, right };
}
