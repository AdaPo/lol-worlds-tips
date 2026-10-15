import { requireUser } from '../auth.js';
import { EXACT_POINTS } from '../services/scoring.js';

export default async function leaderboardRoutes(app, { db }) {
  app.get('/api/leaderboard', { onRequest: requireUser(db) }, async () => {
    const rows = db
      .prepare(
        `SELECT u.id, u.name,
                COALESCE(SUM(p.points), 0) AS total_points,
                COALESCE(SUM(p.points = ?), 0) AS exact_hits,
                COALESCE(SUM(p.points >= 1), 0) AS correct_winners
         FROM users u
         LEFT JOIN predictions p ON p.user_id = u.id
         WHERE u.hidden = 0
         GROUP BY u.id
         ORDER BY total_points DESC, exact_hits DESC, u.name`,
      )
      .all(EXACT_POINTS);

    // Players with the same points and exact hits share a rank.
    let rank = 0;
    return rows.map((r, i) => {
      const prev = rows[i - 1];
      if (!prev || prev.total_points !== r.total_points || prev.exact_hits !== r.exact_hits) {
        rank = i + 1;
      }
      return {
        rank,
        userId: r.id,
        name: r.name,
        totalPoints: r.total_points,
        exactHits: r.exact_hits,
        correctWinners: r.correct_winners,
      };
    });
  });

  // A player's picks, but only for matches that are already locked.
  app.get(
    '/api/users/:id/predictions',
    {
      onRequest: requireUser(db),
      schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } },
    },
    async (request, reply) => {
      const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(request.params.id);
      if (!user) return reply.code(404).send({ error: 'User not found' });

      const rows = db
        .prepare(
          `SELECT m.id, m.stage, m.team1, m.team2, m.team1_image, m.team2_image,
                  m.best_of, m.start_time,
                  m.team1_wins, m.team2_wins, p.pred_team1, p.pred_team2, p.points
           FROM predictions p
           JOIN matches m ON m.id = p.match_id
           WHERE p.user_id = ? AND m.locked_at IS NOT NULL
           ORDER BY m.start_time DESC, m.id DESC`, // newest match first
        )
        .all(user.id);

      return {
        user,
        predictions: rows.map((r) => ({
          matchId: r.id,
          stage: r.stage,
          team1: r.team1,
          team2: r.team2,
          team1Image: r.team1_image,
          team2Image: r.team2_image,
          bestOf: r.best_of,
          startTime: r.start_time,
          prediction: { team1: r.pred_team1, team2: r.pred_team2 },
          result: r.team1_wins === null ? null : { team1: r.team1_wins, team2: r.team2_wins },
          points: r.points,
        })),
      };
    },
  );
}
