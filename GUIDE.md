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
| `server/services/esportsApi.js` | Talks to the LoL Esports API and parses its response. The only file that knows the API format. |
| `server/services/sync.js` | Saves API matches to the DB, scores finished ones, runs on a timer. |
| `server/routes/leaderboard.js` | `GET /api/leaderboard`, `GET /api/users/:id/predictions` |
| `web/index.html` | Page shell. Loads fonts and `src/main.js`. |
| `web/vite.config.js` | Vite setup. Dev server proxies `/api` to the backend. |
| `web/src/main.js` | Mounts the Svelte app. |
| `web/src/App.svelte` | Header + switches between Login and Matches. |
| `web/src/Login.svelte` | Join / log in form. |
| `web/src/Matches.svelte` | Match list: filter, day groups, polling, optimistic save. |
| `web/src/MatchCard.svelte` | One match: teams, status, score picker, everyone's picks. |
| `web/src/Admin.svelte` | Admin page: add match, set result, delete, rescore, manage admins. |
| `scripts/makeadmin.js` | Make a user an admin from the terminal. |
| `web/src/Leaderboard.svelte` | Ranking table. Tap a row to open that player. |
| `web/src/Player.svelte` | One player's locked picks, results, points. |
| `web/src/lib/router.svelte.js` | Tiny router: reads the `#/...` part of the URL. |
| `web/src/lib/api.js` | All backend calls in one place. |
| `web/src/lib/match.js` | Open/TBD checks, valid scores per best-of. |
| `web/src/lib/time.js` | Local time formatting, countdown. |
| `web/src/lib/i18n.svelte.js` | Czech/English text. Use `t('key')` in templates. |
| `web/src/app.css` | Colors, fonts (CSS variables). |
| `scripts/backup.sh` | Backs up the DB, keeps 14 days, copies off the Pi with rclone. |
| `scripts/deploy.sh` | Updates the app on the Pi (backup, pull, build, restart, health check). |
| `deploy/worlds.service` | systemd service so the app starts on boot and restarts on crash. |
| `deploy/crontab.example` | The hourly backup schedule. |
| `DEPLOY.md` | Step-by-step Pi setup, Funnel, backups, restore. |
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

## Languages

- Czech is the default. The **CS / EN** switch in the header remembers the choice.
- All UI text lives in `web/src/lib/i18n.svelte.js`. To change a word, edit it there.
- New text: add the key to **both** `cs` and `en`, then use `t('your.key')`.
- Server error messages are translated there too (`errorsCs`).

## Becoming an admin

1. Join the app normally (invite code, name, PIN).
2. In the repo folder run: `npm run makeadmin -- <your name>`
3. Reload the page. An **Admin** tab appears.
4. From there, make other players admins with one tap.

Your own account is hidden from the leaderboard by default. To change that (or hide anyone else), use **Hide / Show on leaderboard** in Admin > Players.

To remove a player: Admin tab > Players > **Remove**. This deletes their picks and points. Admins must have admin rights removed first.

`npm run makeadmin -- <name> --revoke` removes it. `ADMIN_TOKEN` in `.env` still works as an emergency key.

## Automatic sync

- Needs `ESPORTS_API_KEY` in `.env` (without it, sync is off and you add matches by hand).
- Runs on start, then every 5 min (every 1 min near or during a match).
- Admin tab > **Sync now** runs it immediately.
- If the API is down, the app keeps its last data and logs the error.
- Matches you set by hand are never overwritten by the sync.

## Key rules (why the code looks the way it does)

- Predictions lock at start time, enforced on the server only.
- `locked_at` is set once and never cleared.
- Passwords (PINs) are hashed, never stored as text.
- Times are stored in UTC.
- Points are recomputed from picks + result, never added up, so rescoring is safe.
- Other players' picks are visible only after a match locks.
- "Hidden" is a separate flag from "admin": hidden players are left out of the leaderboard and the shared picks. `makeadmin` hides your account by default; friends you make admin stay visible unless you hide them.
- Team logos come from the API (stored as https URLs) and are shown next to team names.
