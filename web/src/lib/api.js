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
    throw new ApiError(0, 'Cannot reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? data?.message ?? 'Something went wrong');
  }
  return data;
}

export const api = {
  me: () => request('GET', '/api/me'),
  join: (inviteCode, name, pin) => request('POST', '/api/auth/join', { inviteCode, name, pin }),
  login: (name, pin) => request('POST', '/api/auth/login', { name, pin }),
  logout: () => request('POST', '/api/auth/logout', {}),
  matches: () => request('GET', '/api/matches'),
  predict: (matchId, team1, team2) =>
    request('PUT', `/api/predictions/${encodeURIComponent(matchId)}`, { team1, team2 }),
};
