export const EXACT_POINTS = 3;
export const WINNER_POINTS = 1;

// Pure: no database. pred and result are { team1, team2 } win counts.
//
// In a best-of-1 the exact score is simply the winner (1-0 or 0-1), so a
// correct pick there earns the winner point only. Exact-score points exist for
// best-of-3 and best-of-5, where the score is a real extra call.
export function scorePrediction(pred, result, bestOf) {
  const predWinner = pred.team1 > pred.team2 ? 1 : 2;
  const realWinner = result.team1 > result.team2 ? 1 : 2;

  if (bestOf === 1) return predWinner === realWinner ? WINNER_POINTS : 0;

  if (pred.team1 === result.team1 && pred.team2 === result.team2) return EXACT_POINTS;
  return predWinner === realWinner ? WINNER_POINTS : 0;
}

// Recomputes points for every prediction on one match. Safe to run repeatedly:
// points are always derived from the stored picks and result, never added up.
export function scoreMatch(db, matchId) {
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!match || match.state !== 'completed' || match.team1_wins === null) return 0;

  const result = { team1: match.team1_wins, team2: match.team2_wins };
  const predictions = db
    .prepare('SELECT user_id, pred_team1, pred_team2 FROM predictions WHERE match_id = ?')
    .all(matchId);
  const setPoints = db.prepare(
    'UPDATE predictions SET points = ? WHERE user_id = ? AND match_id = ?',
  );

  db.transaction(() => {
    for (const p of predictions) {
      const pick = { team1: p.pred_team1, team2: p.pred_team2 };
      const points = scorePrediction(pick, result, match.best_of);
      setPoints.run(points, p.user_id, matchId);
    }
    db.prepare('UPDATE matches SET scored_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      matchId,
    );
  })();

  return predictions.length;
}

// Rescores every completed match. Returns how many matches were scored.
export function rescoreAll(db) {
  const ids = db
    .prepare("SELECT id FROM matches WHERE state = 'completed' AND team1_wins IS NOT NULL")
    .all();
  for (const { id } of ids) scoreMatch(db, id);
  return ids.length;
}
