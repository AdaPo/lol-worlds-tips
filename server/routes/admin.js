import { requireAdmin } from '../auth.js';
import { rescoreAll, scoreMatch } from '../services/scoring.js';
import { isValidBestOf, isValidScore } from '../validation.js';

export default async function adminRoutes(app, { db, config }) {
  // onRequest runs before body validation, so unauthenticated callers always get 403.
  app.addHook('onRequest', requireAdmin(config.adminToken));

  app.post(
    '/api/admin/matches',
    {
      schema: {
        body: {
          type: 'object',
          required: ['bestOf', 'startTime'],
          properties: {
            stage: { type: 'string' },
            team1: { type: 'string' },
            team2: { type: 'string' },
            team1Code: { type: 'string' },
            team2Code: { type: 'string' },
            bestOf: { type: 'integer' },
            startTime: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const b = request.body;
      if (!isValidBestOf(b.bestOf)) {
        return reply.code(400).send({ error: 'bestOf must be 1, 3 or 5' });
      }
      const start = new Date(b.startTime);
      if (Number.isNaN(start.getTime())) {
        return reply.code(400).send({ error: 'startTime must be an ISO 8601 date' });
      }

      const id = `manual-${Date.now()}`;
      db.prepare(
        `INSERT INTO matches (id, stage, team1, team2, team1_code, team2_code, best_of, start_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        b.stage ?? null,
        b.team1 ?? null,
        b.team2 ?? null,
        b.team1Code ?? null,
        b.team2Code ?? null,
        b.bestOf,
        start.toISOString(),
      );
      return { match: { id } };
    },
  );

  app.put(
    '/api/admin/matches/:id/result',
    {
      schema: {
        body: {
          type: 'object',
          required: ['team1Wins', 'team2Wins'],
          properties: { team1Wins: { type: 'integer' }, team2Wins: { type: 'integer' } },
        },
      },
    },
    async (request, reply) => {
      const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(request.params.id);
      if (!match) return reply.code(404).send({ error: 'Match not found' });

      const { team1Wins, team2Wins } = request.body;
      if (!isValidScore(team1Wins, team2Wins, match.best_of)) {
        return reply.code(400).send({ error: `Invalid score for a best of ${match.best_of}` });
      }

      // manual_override stops the sync job from overwriting this result.
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE matches SET
           team1_wins = ?, team2_wins = ?, state = 'completed', manual_override = 1,
           locked_at = COALESCE(locked_at, ?), updated_at = datetime('now')
         WHERE id = ?`,
      ).run(team1Wins, team2Wins, now, match.id);
      scoreMatch(db, match.id);
      return { match: { id: match.id, team1Wins, team2Wins, state: 'completed' } };
    },
  );

  // Recomputes points for every completed match (e.g. after fixing a result).
  app.post('/api/admin/rescore', async () => ({ matches: rescoreAll(db) }));

  app.delete('/api/admin/matches/:id', async (request, reply) => {
    const { id } = request.params;
    if (!id.startsWith('manual-')) {
      return reply.code(400).send({ error: 'Only manual matches can be deleted' });
    }
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM predictions WHERE match_id = ?').run(id);
      return db.prepare('DELETE FROM matches WHERE id = ?').run(id).changes;
    });
    if (remove() === 0) return reply.code(404).send({ error: 'Match not found' });
    return { ok: true };
  });
}
