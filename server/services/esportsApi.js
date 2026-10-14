// Client + parser for the unofficial LoL Esports API.
//
// This is the ONLY file that knows the API's response format. If Riot changes
// it, fix it here. Checked against the live API on 2026-10-15 (endpoint:
// getSchedule, key sent in the x-api-key header, 403 without it).
import { isValidBestOf, isValidScore } from '../validation.js';

export const WORLDS_LEAGUE_ID = '98767975604431411';

const BASE = 'https://esports-api.lolesports.com/persisted/gw';
const MAX_PAGES = 6;

const STATES = { unstarted: 'unstarted', inProgress: 'inProgress', completed: 'completed' };

async function fetchPage({ leagueId, apiKey, pageToken, fetchImpl }) {
  const url = new URL(`${BASE}/getSchedule`);
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('leagueId', leagueId);
  if (pageToken) url.searchParams.set('pageToken', pageToken);

  const res = await fetchImpl(url, {
    headers: { 'x-api-key': apiKey },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`LoL Esports API responded ${res.status}`);

  const schedule = (await res.json())?.data?.schedule;
  if (!schedule || !Array.isArray(schedule.events)) {
    throw new Error('Unexpected response from the LoL Esports API');
  }
  return schedule;
}

const earliest = (events) =>
  events.length ? Math.min(...events.map((e) => Date.parse(e.startTime))) : null;

// Turns one API event into a row for our matches table, or null to ignore it.
// Warnings (e.g. an odd result) are pushed onto `warnings` when given.
export function parseEvent(event, warnings = []) {
  if (event?.type !== 'match' || !event.match?.id) return null;

  const { id, teams, strategy } = event.match;
  const bestOf = strategy?.count;
  if (!Array.isArray(teams) || teams.length !== 2 || !isValidBestOf(bestOf)) return null;

  const startTime = new Date(event.startTime);
  if (Number.isNaN(startTime.getTime())) return null;

  const name = (t) => (!t?.name || t.name.toUpperCase() === 'TBD' ? null : t.name);
  const code = (t) => (!t?.code || t.code.toUpperCase() === 'TBD' ? null : t.code);

  const state = STATES[event.state] ?? 'unstarted';

  // gameWins is 0 for unstarted matches, so only trust it once completed.
  let team1Wins = null;
  let team2Wins = null;
  if (state === 'completed') {
    const w1 = teams[0].result?.gameWins;
    const w2 = teams[1].result?.gameWins;
    if (isValidScore(w1, w2, bestOf)) {
      team1Wins = w1;
      team2Wins = w2;
    } else {
      warnings.push(`Match ${id}: completed with unusable score ${w1}-${w2} (best of ${bestOf})`);
    }
  }

  return {
    id: String(id),
    stage: event.blockName ?? null,
    team1: name(teams[0]),
    team2: name(teams[1]),
    team1Code: code(teams[0]),
    team2Code: code(teams[1]),
    bestOf,
    startTime: startTime.toISOString(),
    state,
    team1Wins,
    team2Wins,
  };
}

// Fetches the schedule and returns parsed matches on or after `since`.
// The first page is centred on "now"; we follow `newer` to the end and `older`
// only while a page still reaches back to `since`.
export async function fetchMatches({
  leagueId,
  apiKey,
  since,
  fetchImpl = fetch,
  warnings = [],
}) {
  const sinceMs = Date.parse(since);
  const events = [];
  const get = (pageToken) => fetchPage({ leagueId, apiKey, pageToken, fetchImpl });

  const first = await get();
  events.push(...first.events);

  let token = first.pages?.newer;
  for (let i = 0; token && i < MAX_PAGES; i++) {
    const page = await get(token);
    events.push(...page.events);
    token = page.pages?.newer;
  }

  let page = first;
  token = first.pages?.older;
  for (let i = 0; token && i < MAX_PAGES; i++) {
    const start = earliest(page.events);
    if (start === null || start < sinceMs) break;
    page = await get(token);
    events.push(...page.events);
    token = page.pages?.older;
  }

  const byId = new Map();
  for (const event of events) {
    const match = parseEvent(event, warnings);
    if (match && Date.parse(match.startTime) >= sinceMs) byId.set(match.id, match);
  }
  return [...byId.values()];
}
