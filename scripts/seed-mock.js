// Creates a throwaway database full of fake users, matches and picks, so you
// can click through the app and check the scoring by eye.
//
//   npm run seed:mock     (writes ./data/mock.db, replacing it)
//   npm run dev:mock      (starts the app on that database)
//
// Safety: it only writes to a file whose name contains "mock", never app.db.
// It also checks the points it produced against hand-computed values.
import { rmSync } from 'node:fs';
import { basename } from 'node:path';
import { buildApp } from '../server/app.js';
import { hashPin } from '../server/auth.js';
import { openDb } from '../server/db.js';
import { scoreMatch } from '../server/services/scoring.js';

const path = process.argv[2] ?? './data/mock.db';
if (!basename(path).includes('mock')) {
  console.error(`Refusing to touch "${path}": the file name must contain "mock".`);
  process.exit(1);
}
for (const suffix of ['', '-wal', '-shm']) rmSync(path + suffix, { force: true });

const PIN = '123456';
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const now = Date.now();
const at = (offsetMs) => new Date(now + offsetMs).toISOString();

// Logos only for a few teams, so both "with logo" and "without" are visible.
const CDN = 'https://static.lolesports.com/teams/';
const TEAM = {
  T1: { name: 'T1' },
  G2: { name: 'G2 Esports' },
  GEN: { name: 'Gen.G' },
  BLG: { name: 'Bilibili Gaming' },
  JDG: { name: 'JD Gaming' },
  FNC: { name: 'Fnatic' },
  TES: { name: 'Top Esports' },
  MKOI: { name: 'Movistar KOI' },
  C9: { name: 'Cloud9 Kia', image: CDN + '1736924120254_C9Kia_IconBlue_Transparent_2000x2000.png' },
  KC: { name: 'Karmine Corp', image: CDN + '1704714951336_KC.png' },
  FUR: { name: 'FURIA', image: CDN + 'FURIA---black.png' },
  VKS: { name: 'Vivo Keyd Stars', image: CDN + '1670542079678_vks.png' },
};
const team = (code) => (code ? { code, ...TEAM[code] } : { code: null, name: null, image: null });

// state: completed | inProgress | unstarted. `result` is [team1Wins, team2Wins].
const MATCHES = [
  // Finished: scored below.
  { id: 'mock-c1', stage: 'Swiss', a: 'T1', b: 'G2', bo: 1, start: -3 * DAY, state: 'completed', result: [1, 0] },
  { id: 'mock-c2', stage: 'Swiss', a: 'GEN', b: 'BLG', bo: 3, start: -2 * DAY, state: 'completed', result: [2, 1] },
  { id: 'mock-c3', stage: 'Quarterfinals', a: 'JDG', b: 'FNC', bo: 5, start: -1 * DAY, state: 'completed', result: [3, 2] },
  { id: 'mock-c4', stage: 'Swiss', a: 'TES', b: 'MKOI', bo: 3, start: -1 * DAY + 4 * 60 * MIN, state: 'completed', result: [0, 2] },
  // Live now.
  { id: 'mock-live', stage: 'Swiss', a: 'BLG', b: 'T1', bo: 3, start: -25 * MIN, state: 'inProgress' },
  // Open for picks.
  // Starts 2 minutes after seeding: watch it go from open to locked.
  // `npm run mock:soon` restarts this countdown without rebuilding the database.
  { id: 'mock-soon', stage: 'Play-Ins', a: 'C9', b: 'KC', bo: 1, start: 2 * MIN, state: 'unstarted' },
  { id: 'mock-open1', stage: 'Swiss', a: 'GEN', b: 'G2', bo: 3, start: 1 * DAY, state: 'unstarted' },
  { id: 'mock-open2', stage: 'Quarterfinals', a: 'FUR', b: 'MKOI', bo: 5, start: 3 * DAY, state: 'unstarted' },
  { id: 'mock-open3', stage: 'Play-Ins', a: 'VKS', b: 'TES', bo: 1, start: 2 * DAY, state: 'unstarted' },
  { id: 'manual-mock-1', stage: 'Swiss', a: 'T1', b: 'JDG', bo: 3, start: 1.5 * DAY, state: 'unstarted' },
  // One team known, one not: shown, but cannot be picked yet.
  { id: 'mock-half', stage: 'Semifinals', a: 'T1', b: null, bo: 5, start: 4 * DAY, state: 'unstarted' },
  // No team known: hidden by default on the matches and admin pages.
  { id: 'mock-tbd1', stage: 'Semifinals', a: null, b: null, bo: 5, start: 5 * DAY, state: 'unstarted' },
  { id: 'mock-tbd2', stage: 'Finals', a: null, b: null, bo: 5, start: 6 * DAY, state: 'unstarted' },
  { id: 'mock-tbd3', stage: 'Play-Ins', a: null, b: null, bo: 3, start: 5.5 * DAY, state: 'unstarted' },
];

const USERS = [
  { name: 'Alice' },
  { name: 'Bob' },
  { name: 'Cecilie' },
  { name: 'David' },
  { name: 'Eva' },
  { name: 'Filip' },
  { name: 'Karel', admin: 1 }, // admin who also plays: stays on the leaderboard
  { name: 'Organizer', admin: 1, hidden: 1 }, // the organizer: hidden from the leaderboard
];

// Picks as [team1Wins, team2Wins, expectedPoints]. The expected points are
// worked out by hand from the rules (3 exact score, 1 right winner only, 0 wrong;
// in a best-of-1 the right winner is worth 1, since the score is the winner).
// They are only given for finished matches and are checked against the real scoring.
const PICKS = {
  // best-of-1, result 1-0: the right winner earns 1 point, never 3
  'mock-c1': {
    Alice: [1, 0, 1], Bob: [0, 1, 0], Cecilie: [1, 0, 1], Eva: [0, 1, 0],
    Filip: [1, 0, 1], Karel: [1, 0, 1], Organizer: [0, 1, 0],
  },
  // result 2-1
  'mock-c2': {
    Alice: [2, 1, 3], Bob: [2, 0, 1], Cecilie: [1, 2, 0], David: [2, 1, 3],
    Eva: [2, 0, 1], Filip: [0, 2, 0], Karel: [2, 0, 1], Organizer: [2, 1, 3],
  },
  // result 3-2
  'mock-c3': {
    Alice: [3, 0, 1], Bob: [3, 2, 3], Cecilie: [3, 1, 1], David: [2, 3, 0], Eva: [3, 2, 3],
  },
  // result 0-2
  'mock-c4': {
    Alice: [0, 2, 3], Bob: [1, 2, 1], Cecilie: [2, 0, 0], David: [0, 2, 3],
    Eva: [2, 1, 0], Filip: [1, 2, 1],
  },
  'mock-live': { Alice: [2, 0], Bob: [2, 1], Cecilie: [0, 2], Organizer: [2, 0] },
  // Others' picks stay hidden until it locks (Organizer is hidden for good).
  'mock-soon': { Alice: [1, 0], Bob: [0, 1], Cecilie: [1, 0], Organizer: [0, 1] },
  'mock-open1': { Alice: [2, 0], Bob: [1, 2] },
};

// What the leaderboard must show (visible players only), worked out by hand
// (points per match c1 + c2 + c3 + c4). "Exact hits" are 3-point picks, so a
// best-of-1 never counts as one.
//   Alice 1+3+1+3=8, David 0+3+0+3=6, Bob 0+1+3+1=5, Eva 0+1+3+0=4,
//   Cecilie 1+0+1+0=2, Filip 1+0+0+1=2, Karel 1+1=2 (no exact hits: shared rank 5).
const EXPECTED_LEADERBOARD = [
  { rank: 1, name: 'Alice', totalPoints: 8, exactHits: 2, correctWinners: 4 },
  { rank: 2, name: 'David', totalPoints: 6, exactHits: 2, correctWinners: 2 },
  { rank: 3, name: 'Bob', totalPoints: 5, exactHits: 1, correctWinners: 3 },
  { rank: 4, name: 'Eva', totalPoints: 4, exactHits: 1, correctWinners: 2 },
  { rank: 5, name: 'Cecilie', totalPoints: 2, exactHits: 0, correctWinners: 2 },
  { rank: 5, name: 'Filip', totalPoints: 2, exactHits: 0, correctWinners: 2 },
  { rank: 5, name: 'Karel', totalPoints: 2, exactHits: 0, correctWinners: 2 },
];

const db = openDb(path);

// --- users
const pinHash = hashPin(PIN);
const addUser = db.prepare(
  'INSERT INTO users (name, pin_hash, is_admin, hidden) VALUES (?, ?, ?, ?)',
);
for (const u of USERS) addUser.run(u.name, pinHash, u.admin ?? 0, u.hidden ?? 0);
const userId = Object.fromEntries(
  db.prepare('SELECT id, name FROM users').all().map((u) => [u.name, u.id]),
);

// --- matches
const addMatch = db.prepare(
  `INSERT INTO matches (id, stage, team1, team2, team1_code, team2_code, team1_image,
                        team2_image, best_of, start_time, locked_at, state, team1_wins,
                        team2_wins, manual_override)
   VALUES (@id, @stage, @team1, @team2, @team1_code, @team2_code, @team1_image,
           @team2_image, @best_of, @start_time, @locked_at, @state, @team1_wins,
           @team2_wins, @manual_override)`,
);
for (const m of MATCHES) {
  const t1 = team(m.a);
  const t2 = team(m.b);
  const started = m.start <= 0;
  addMatch.run({
    id: m.id,
    stage: m.stage,
    team1: t1.name,
    team2: t2.name,
    team1_code: t1.code,
    team2_code: t2.code,
    team1_image: t1.image ?? null,
    team2_image: t2.image ?? null,
    best_of: m.bo,
    start_time: at(m.start),
    locked_at: started ? at(m.start) : null,
    state: m.state,
    team1_wins: m.result?.[0] ?? null,
    team2_wins: m.result?.[1] ?? null,
    manual_override: m.id.startsWith('manual-') ? 1 : 0,
  });
}

// --- picks
const addPick = db.prepare(
  'INSERT INTO predictions (user_id, match_id, pred_team1, pred_team2) VALUES (?, ?, ?, ?)',
);
for (const [matchId, picks] of Object.entries(PICKS)) {
  for (const [name, [t1, t2]] of Object.entries(picks)) {
    addPick.run(userId[name], matchId, t1, t2);
  }
}

// --- score finished matches with the real scoring code, then check by hand values
for (const m of MATCHES.filter((x) => x.state === 'completed')) scoreMatch(db, m.id);

const problems = [];
const getPoints = db.prepare(
  'SELECT points FROM predictions WHERE user_id = ? AND match_id = ?',
);
for (const [matchId, picks] of Object.entries(PICKS)) {
  for (const [name, [, , expected]] of Object.entries(picks)) {
    if (expected === undefined) continue;
    const actual = getPoints.get(userId[name], matchId).points;
    if (actual !== expected) {
      problems.push(`${matchId} ${name}: expected ${expected} points, got ${actual}`);
    }
  }
}

// --- check the leaderboard through the real API route
const app = await buildApp({
  db,
  config: { inviteCode: 'mock', adminToken: 'mock-admin-token', authRateLimitMax: 1000, logger: false },
});
const login = await app.inject({
  method: 'POST',
  url: '/api/auth/login',
  payload: { name: 'Alice', pin: PIN },
});
const cookie = `session=${login.cookies.find((c) => c.name === 'session').value}`;
const board = await app.inject({ method: 'GET', url: '/api/leaderboard', headers: { cookie } });
const actualBoard = board
  .json()
  .map(({ rank, name, totalPoints, exactHits, correctWinners }) => ({
    rank, name, totalPoints, exactHits, correctWinners,
  }));
await app.close();
db.close();

if (JSON.stringify(actualBoard) !== JSON.stringify(EXPECTED_LEADERBOARD)) {
  problems.push(
    `leaderboard differs.\n  expected: ${JSON.stringify(EXPECTED_LEADERBOARD)}\n  actual:   ${JSON.stringify(actualBoard)}`,
  );
}

console.log(`Mock database written to ${path}\n`);
console.log('Log in with PIN 123456 as any of:');
console.log('  players : Alice, Bob, Cecilie, David, Eva, Filip');
console.log('  admins  : Karel (visible on the leaderboard), Organizer (hidden)');
console.log('Invite code: mock   Admin token: mock-admin-token\n');
console.log('Leaderboard (checked against hand-computed values):');
for (const r of actualBoard) {
  console.log(
    `  ${String(r.rank).padStart(2)}. ${r.name.padEnd(8)} ${String(r.totalPoints).padStart(2)} pts` +
      `  (${r.exactHits} exact, ${r.correctWinners} winners)`,
  );
}
if (problems.length) {
  console.error('\nSCORING CHECK FAILED:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('\nScoring check passed.\nStart the app with: npm run dev:mock');
