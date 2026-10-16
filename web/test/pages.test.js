// Renders the real app in a fake browser, with a tiny fake server behind fetch.
// These tests exist to catch pages that crash or get stuck on "loading".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const H = 3_600_000;
const DAY = 24 * H;
const iso = (ms) => new Date(ms).toISOString();

// A time today / tomorrow in the viewer's local timezone, so "same day" is stable.
const localTime = (daysAhead, hour) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

function match(over = {}) {
  return {
    id: 'm1',
    stage: 'Swiss',
    team1: 'T1',
    team2: 'G2 Esports',
    team1Code: 'T1',
    team2Code: 'G2',
    team1Image: null,
    team2Image: null,
    bestOf: 3,
    startTime: iso(Date.now() + DAY),
    state: 'unstarted',
    locked: false,
    team1Wins: null,
    team2Wins: null,
    myPrediction: null,
    predictions: null,
    ...over,
  };
}

// Answers the API calls the app makes, and records them.
function fakeServer({ matches = [], user = { id: 1, name: 'Alice', isAdmin: false }, loggedIn = true } = {}) {
  const calls = [];
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchMock = vi.fn(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = String(url);
    calls.push(`${method} ${path}`);

    if (path === '/api/me') return loggedIn ? json({ user }) : json({ error: 'Not logged in' }, 401);
    if (path === '/api/matches') return json(matches);
    if (path === '/api/leaderboard') {
      return json([
        { rank: 1, userId: 1, name: 'Alice', totalPoints: 7, exactHits: 2, correctWinners: 3 },
        { rank: 2, userId: 2, name: 'Bob', totalPoints: 4, exactHits: 1, correctWinners: 1 },
      ]);
    }
    if (path === '/api/admin/users') {
      return json([
        { id: 1, name: 'Alice', isAdmin: true, hidden: false },
        { id: 2, name: 'Bob', isAdmin: false, hidden: false },
      ]);
    }

    const pick = path.match(/^\/api\/predictions\/(.+)$/);
    if (pick) {
      const m = matches.find((x) => x.id === decodeURIComponent(pick[1]));
      if (!m) return json({ error: 'Match not found' }, 404);
      if (method === 'PUT') {
        const { team1, team2 } = JSON.parse(init.body);
        const savedAt = new Date().toISOString();
        m.myPrediction = { team1, team2, points: null, savedAt };
        return json({ prediction: { matchId: m.id, team1, team2, savedAt } });
      }
      if (method === 'DELETE') {
        m.myPrediction = null;
        return json({ ok: true, deleted: true });
      }
    }
    return json({ error: 'Not found' }, 404);
  });

  return { fetchMock, calls };
}

let mounted = null;

// Fresh copy of the app on each call (its router and language state are module-level).
async function openApp(server, hash = '') {
  localStorage.setItem('lang', 'en'); // assertions below read English
  vi.stubGlobal('fetch', server.fetchMock);
  window.scrollTo = () => {}; // jsdom has no scrolling
  location.hash = hash;
  vi.resetModules();
  const { mount, unmount } = await import('svelte');
  const { default: App } = await import('../src/App.svelte');

  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(App, { target });
  mounted = { unmount: () => unmount(app), target };
  return target;
}

const waitFor = (fn) => vi.waitFor(fn, { timeout: 4000 });
const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
const cards = (root) => [...root.querySelectorAll('article.card')];
const button = (root, label) =>
  [...root.querySelectorAll('button')].find((b) => text(b).startsWith(label));
// The on/off switch whose label starts with this text.
const switchFor = (root, label) =>
  [...root.querySelectorAll('label.toggle')]
    .find((l) => text(l).startsWith(label))
    ?.querySelector('input[role="switch"]');

afterEach(() => {
  mounted?.unmount();
  mounted?.target.remove();
  mounted = null;
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('matches page', () => {
  it('renders when a finished and an upcoming match fall on the same day', async () => {
    // Used to crash with each_key_duplicate and sit on the loading skeleton.
    const server = fakeServer({
      matches: [
        match({
          id: 'done',
          startTime: iso(localTime(0, 8)),
          state: 'completed',
          locked: true,
          team1Wins: 2,
          team2Wins: 1,
          myPrediction: { team1: 2, team2: 1, points: 3, savedAt: iso(Date.now() - DAY) },
        }),
        match({ id: 'later-today', startTime: iso(localTime(0, 20)) }),
        match({ id: 'tomorrow', startTime: iso(localTime(1, 20)) }),
      ],
    });
    const root = await openApp(server);

    await waitFor(() => expect(cards(root)).toHaveLength(3));
    expect(root.querySelector('.skeleton')).toBeNull();
    expect(root.querySelector('.errorbox')).toBeNull();
    // One heading per day: today (both matches) and tomorrow.
    expect(root.querySelectorAll('.day h2')).toHaveLength(2);
  });

  it('shows the result and the points earned on a finished match', async () => {
    const server = fakeServer({
      matches: [
        match({
          state: 'completed',
          locked: true,
          startTime: iso(Date.now() - DAY),
          team1Wins: 2,
          team2Wins: 1,
          myPrediction: { team1: 2, team2: 1, points: 3, savedAt: iso(Date.now() - 2 * DAY) },
        }),
      ],
    });
    const root = await openApp(server);

    await waitFor(() => expect(cards(root)).toHaveLength(1));
    const card = text(cards(root)[0]);
    expect(card).toContain('Final');
    expect(card).toContain('2–1');
    expect(card).toContain('+3 pts');
    expect(card).toContain('Saved');
  });

  it('hides matches with no known team by default, and a switch brings them back', async () => {
    const server = fakeServer({
      matches: [
        match({ id: 'known' }),
        match({ id: 'tbd', team1: null, team2: null, team1Code: null, team2Code: null }),
      ],
    });
    const root = await openApp(server);

    await waitFor(() => expect(cards(root)).toHaveLength(1));
    const sw = switchFor(root, 'Hide matches with no known teams');
    expect(sw.checked).toBe(true); // on by default
    sw.click(); // switch off: show them
    await waitFor(() => expect(cards(root)).toHaveLength(2));
    expect(sw.checked).toBe(false);
  });

  describe('finished matches', () => {
    const finished = (over = {}) =>
      match({
        id: 'done',
        state: 'completed',
        locked: true,
        startTime: iso(Date.now() - 2 * DAY),
        team1Wins: 3,
        team2Wins: 1,
        ...over,
      });

    it('can be hidden on the All tab with a switch, and come back', async () => {
      const server = fakeServer({ matches: [finished(), match({ id: 'next' })] });
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(2));

      const sw = switchFor(root, 'Hide finished matches');
      expect(sw.checked).toBe(false); // off by default
      sw.click();
      await waitFor(() => expect(cards(root)).toHaveLength(1));
      expect(text(cards(root)[0])).not.toContain('Final');

      sw.click();
      await waitFor(() => expect(cards(root)).toHaveLength(2));
    });

    it('are still listed on the Finished tab while the switch is on', async () => {
      const server = fakeServer({ matches: [finished(), match({ id: 'next' })] });
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(2));

      switchFor(root, 'Hide finished matches').click();
      await waitFor(() => expect(cards(root)).toHaveLength(1));

      button(root, 'Finished').click();
      await waitFor(() => expect(cards(root)).toHaveLength(1));
      expect(text(cards(root)[0])).toContain('Final');
      expect(root.querySelector('.options')).toBeNull(); // switches belong to the All tab
    });

    it('say so when everything is hidden', async () => {
      const server = fakeServer({ matches: [finished()] });
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(1));

      switchFor(root, 'Hide finished matches').click();
      await waitFor(() => expect(text(root)).toContain('All matches are hidden'));
      expect(cards(root)).toHaveLength(0);
    });

    it('are clearly marked as final, with the winner named', async () => {
      const server = fakeServer({ matches: [finished()] }); // T1 won 3-1
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(1));
      const card = cards(root)[0];

      expect(card.classList.contains('done')).toBe(true);
      expect(card.querySelector('.final-pill').textContent).toBe('Final');

      const winners = card.querySelectorAll('.winner-tag');
      expect(winners).toHaveLength(1); // exactly one winner
      expect(text(card.querySelector('.team.win'))).toContain('T1');
      expect(card.querySelector('.team.win .winner-tag')).not.toBeNull();
      expect(card.querySelector('.team.lose .winner-tag')).toBeNull();
    });

    it('marks the second team as winner when it wins', async () => {
      const server = fakeServer({ matches: [finished({ team1Wins: 0, team2Wins: 3 })] });
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(1));
      const card = cards(root)[0];

      expect(text(card.querySelector('.team.r.win'))).toContain('G2');
      expect(card.querySelector('.team.r.win .winner-tag')).not.toBeNull();
      expect(card.querySelector('.team:not(.r) .winner-tag')).toBeNull();
    });

    it('do not show winner tags on matches that are not finished', async () => {
      const server = fakeServer({ matches: [match({ id: 'later' })] });
      const root = await openApp(server);
      await waitFor(() => expect(cards(root)).toHaveLength(1));
      expect(root.querySelector('.winner-tag')).toBeNull();
      expect(root.querySelector('.final-pill')).toBeNull();
    });
  });

  it('saves a pick, then removes it by tapping the same score again', async () => {
    const server = fakeServer({ matches: [match({ id: 'open' })] });
    const root = await openApp(server);
    await waitFor(() => expect(cards(root)).toHaveLength(1));

    const scoreButton = () => [...root.querySelectorAll('.picker button')].find((b) => text(b) === '2–0');

    scoreButton().click();
    await waitFor(() => expect(text(cards(root)[0])).toContain('Saved'));
    expect(server.calls).toContain('PUT /api/predictions/open');
    expect(text(cards(root)[0])).toContain('Your pick T1 wins 2–0');

    scoreButton().click(); // same score again: deselect
    await waitFor(() => expect(text(cards(root)[0])).toContain('No pick made'));
    expect(server.calls).toContain('DELETE /api/predictions/open');
    expect(text(cards(root)[0])).not.toContain('Saved');
  });
});

describe('other pages', () => {
  it('shows the login form when logged out', async () => {
    const root = await openApp(fakeServer({ loggedIn: false }));
    await waitFor(() => expect(root.querySelector('form')).not.toBeNull());
    expect(text(root)).toContain('Log in');
    expect(root.querySelectorAll('input').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the leaderboard', async () => {
    const root = await openApp(fakeServer(), '#/leaderboard');
    await waitFor(() => expect(root.querySelectorAll('ol li')).toHaveLength(2));
    expect(text(root)).toContain('Alice');
    expect(text(root)).toContain('Bob');
  });

  it('renders the admin page for an admin', async () => {
    const server = fakeServer({ user: { id: 1, name: 'Alice', isAdmin: true } });
    const root = await openApp(server, '#/admin');
    await waitFor(() => expect(text(root)).toContain('Players'));
    expect(text(root)).toContain('Bob');
    expect(root.querySelector('.errorbox, .error')).toBeNull();
  });
});

beforeEach(() => {
  localStorage.clear();
});
