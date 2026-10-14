import { requireUser } from '../auth.js';
import { lockStartedMatches } from '../matches.js';
import { isTbd, isValidScore } from '../validation.js';

export default async function predictionRoutes(app, { db }) {
  app.put(
    '/api/predictions/:matchId',
    {
      preHandler: requireUser(db),
      schema: {
        body: {
          type: 'object',
          required: ['team1', 'team2'],
          properties: { team1: { type: 'integer' }, team2: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      lockStartedMatches(db);

      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(request.params.matchId);
      if (!match) return reply.code(404).send({ error: 'Match not found' });
      if (match.locked_at !== null) {
        return reply.code(409).send({ error: 'Match is locked' });
      }
      if (isTbd(match.team1) || isTbd(match.team2)) {
        return reply.code(409).send({ error: 'Teams are not decided yet' });
      }

      const { team1, team2 } = request.body;
      if (!isValidScore(team1, team2, match.best_of)) {
        return reply.code(400).send({ error: `Invalid score for a best of ${match.best_of}` });
      }

      db.prepare(
        `INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, match_id) DO UPDATE SET
           pred_team1 = excluded.pred_team1,
           pred_team2 = excluded.pred_team2,
           updated_at = datetime('now')`,
      ).run(request.user.id, match.id, team1, team2);

      return { prediction: { matchId: match.id, team1, team2 } };
    },
  );
}
