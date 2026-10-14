# Project Guide

Short map of the code. Updated every phase.

## What runs where

```
Browser --> Fastify server (server/) --> SQLite file (data/app.db)
            '-- later: Svelte frontend (web/)
```

## Files

| File | What it does |
|---|---|
| `server/index.js` | Entry point. Loads `.env`, opens DB, starts the server. |
| `server/app.js` | Builds the Fastify app and registers all routes. |
| `server/db.js` | Opens SQLite, creates tables (migrations). |
| `server/auth.js` | PIN hashing, sessions, `requireUser` / `requireAdmin` checks. |
| `server/validation.js` | Is this score valid for a Bo1/Bo3/Bo5? Is a team TBD? |
| `server/matches.js` | Locks matches once they start. |
| `server/routes/auth.js` | `/api/auth/join`, `login`, `logout`, `/api/me` |
| `server/routes/matches.js` | `GET /api/matches` |
| `server/routes/predictions.js` | `PUT /api/predictions/:matchId` |
| `server/routes/admin.js` | Admin: add match, set result, delete match, rescore |
| `server/services/scoring.js` | Points rules (3 exact, 1 winner, 0 wrong) and recompute. |
| `server/routes/leaderboard.js` | `GET /api/leaderboard`, `GET /api/users/:id/predictions` |
| `web/index.html` | Page shell. Loads fonts and `src/main.js`. |
| `web/vite.config.js` | Vite setup. Dev server proxies `/api` to the backend. |
| `web/src/main.js` | Mounts the Svelte app. |
| `web/src/App.svelte` | Header + switches between Login and Matches. |
| `web/src/Login.svelte` | Join / log in form. |
| `web/src/Matches.svelte` | Match list: filter, day groups, polling, optimistic save. |
| `web/src/MatchCard.svelte` | One match: teams, status, score picker, everyone's picks. |
| `web/src/lib/api.js` | All backend calls in one place. |
| `web/src/lib/match.js` | Open/TBD checks, valid scores per best-of. |
| `web/src/lib/time.js` | Local time formatting, countdown. |
| `web/src/app.css` | Colors, fonts (CSS variables). |
| `test/*.test.js` | Automated tests (run with `npm test`) |
| `.env` | Secrets and config (not in git). Template: `.env.example` |

## How a request flows

1. Request hits a route (e.g. `PUT /api/predictions/m1`).
2. `onRequest` hook checks who you are (`requireUser`).
3. Fastify validates the body (`schema`).
4. Route handler runs SQL and returns JSON.

## Svelte bits you'll see

- `$state(x)` : a value that updates the screen when changed.
- `$derived(expr)` : a value computed from other state, auto-updated.
- `$props()` : inputs a component receives from its parent.
- `{#if}` / `{#each}` : conditions and loops in the template.
- `onclick={fn}` : run `fn` on click. `bind:value={x}` : keep input and `x` in sync.
- `<style>` in a component only affects that component.

## JS bits you'll see

- `import x from './x.js'` / `export function` : split code across files.
- `async` / `await` : wait for something without blocking. Route handlers are `async`.
- `const { a, b } = obj` : pull fields out of an object.
- `x?.y` : read `y`, but give `undefined` if `x` is null.
- `a ?? b` : use `b` only if `a` is null/undefined.
- `` `text ${value}` `` : string with a value inside.
- `db.prepare('... ?').run(value)` : SQL with safe placeholders (`?`).

## Commands

| Command | Does |
|---|---|
| `npm install` | Install dependencies |
| `npm start` | Run the server |
| `npm run dev` | Run and restart on file changes |
| `npm test` | Run tests |
| `npm run build` (in `web/`) | Build the frontend into `web/dist` |
| `npm run dev` (in `web/`) | Frontend dev server (needs backend running) |

## Key rules (why the code looks the way it does)

- Predictions lock at start time, enforced on the server only.
- `locked_at` is set once and never cleared.
- Passwords (PINs) are hashed, never stored as text.
- Times are stored in UTC.
- Points are recomputed from picks + result, never added up, so rescoring is safe.
- Other players' picks are visible only after a match locks.
