import { requireUser } from '../auth.js';
import { lockStartedMatches } from '../matches.js';

export default async function matchRoutes(app, { db }) {
  app.get('/api/matches', { onRequest: requireUser(db) }, async (request) => {
    lockStartedMatches(db);

    const matches = db.prepare('SELECT * FROM matches ORDER BY start_time, id').all();

    const mine = new Map(
      db
        .prepare(
          'SELECT match_id, pred_team1, pred_team2, points FROM predictions WHERE user_id = ?',
        )
        .all(request.user.id)
        .map((p) => [p.match_id, p]),
    );

    // Everyone's picks, but only for matches that are locked.
    const visible = new Map();
    const rows = db
      .prepare(
        `SELECT p.match_id, p.user_id, u.name, p.pred_team1, p.pred_team2, p.points
         FROM predictions p
         JOIN users u ON u.id = p.user_id
         JOIN matches m ON m.id = p.match_id
         WHERE m.locked_at IS NOT NULL AND u.hidden = 0
         ORDER BY u.name`,
      )
      .all();
    for (const r of rows) {
      if (!visible.has(r.match_id)) visible.set(r.match_id, []);
      visible.get(r.match_id).push({
        userId: r.user_id,
        name: r.name,
        team1: r.pred_team1,
        team2: r.pred_team2,
        points: r.points,
      });
    }

    return matches.map((m) => {
      const p = mine.get(m.id);
      const locked = m.locked_at !== null;
      return {
        id: m.id,
        stage: m.stage,
        team1: m.team1,
        team2: m.team2,
        team1Code: m.team1_code,
        team2Code: m.team2_code,
        team1Image: m.team1_image,
        team2Image: m.team2_image,
        bestOf: m.best_of,
        startTime: m.start_time,
        state: m.state,
        locked,
        team1Wins: m.team1_wins,
        team2Wins: m.team2_wins,
        myPrediction: p ? { team1: p.pred_team1, team2: p.pred_team2, points: p.points } : null,
        predictions: locked ? (visible.get(m.id) ?? []) : null,
      };
    });
  });
}
