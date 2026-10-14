import { translateError } from './i18n.svelte.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, translateError('Cannot reach the server. Check your connection.', 0));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error ?? data?.message ?? 'Something went wrong';
    throw new ApiError(res.status, translateError(message, res.status));
  }
  return data;
}

export const api = {
  me: () => request('GET', '/api/me'),
  join: (inviteCode, name, pin) => request('POST', '/api/auth/join', { inviteCode, name, pin }),
  login: (name, pin) => request('POST', '/api/auth/login', { name, pin }),
  logout: () => request('POST', '/api/auth/logout', {}),
  matches: () => request('GET', '/api/matches'),
  adminUsers: () => request('GET', '/api/admin/users'),
  setAdmin: (id, isAdmin) => request('PUT', `/api/admin/users/${id}/admin`, { isAdmin }),
  setHidden: (id, hidden) => request('PUT', `/api/admin/users/${id}/hidden`, { hidden }),
  deleteUser: (id) => request('DELETE', `/api/admin/users/${id}`),
  addMatch: (body) => request('POST', '/api/admin/matches', body),
  setResult: (id, team1Wins, team2Wins) =>
    request('PUT', `/api/admin/matches/${encodeURIComponent(id)}/result`, { team1Wins, team2Wins }),
  deleteMatch: (id) => request('DELETE', `/api/admin/matches/${encodeURIComponent(id)}`),
  rescore: () => request('POST', '/api/admin/rescore', {}),
  sync: () => request('POST', '/api/admin/sync', {}),
  leaderboard: () => request('GET', '/api/leaderboard'),
  userPredictions: (id) => request('GET', `/api/users/${encodeURIComponent(id)}/predictions`),
  predict: (matchId, team1, team2) =>
    request('PUT', `/api/predictions/${encodeURIComponent(matchId)}`, { team1, team2 }),
};
