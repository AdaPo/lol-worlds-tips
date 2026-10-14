import { requireAdmin } from '../auth.js';
import { rescoreAll, scoreMatch } from '../services/scoring.js';
import { isValidBestOf, isValidScore } from '../validation.js';

export default async function adminRoutes(app, { db, config }) {
  // onRequest runs before body validation, so unauthenticated callers always get 403.
  app.addHook('onRequest', requireAdmin(db, config.adminToken));

  app.get('/api/admin/users', async () =>
    db
      .prepare('SELECT id, name, is_admin FROM users ORDER BY name')
      .all()
      .map((u) => ({ id: u.id, name: u.name, isAdmin: u.is_admin === 1 })),
  );

  app.put(
    '/api/admin/users/:id/admin',
    {
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } } },
        body: {
          type: 'object',
          required: ['isAdmin'],
          properties: { isAdmin: { type: 'boolean' } },
        },
      },
    },
    async (request, reply) => {
      // Stops an admin from locking themselves out by accident.
      if (request.user?.id === request.params.id) {
        return reply.code(400).send({ error: 'You cannot change your own admin status' });
      }
      const { changes } = db
        .prepare('UPDATE users SET is_admin = ? WHERE id = ?')
        .run(request.body.isAdmin ? 1 : 0, request.params.id);
      if (changes === 0) return reply.code(404).send({ error: 'User not found' });
      return { ok: true };
    },
  );

  app.delete(
    '/api/admin/users/:id',
    { schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } },
    async (request, reply) => {
      const { id } = request.params;
      if (request.user?.id === id) {
        return reply.code(400).send({ error: 'You cannot remove yourself' });
      }
      const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(id);
      if (!user) return reply.code(404).send({ error: 'User not found' });
      if (user.is_admin) {
        return reply.code(400).send({ error: 'Remove admin rights before removing this user' });
      }

      db.transaction(() => {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM predictions WHERE user_id = ?').run(id);
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
      })();
      return { ok: true };
    },
  );

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
