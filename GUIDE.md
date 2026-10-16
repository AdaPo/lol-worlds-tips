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
| `server/services/scoring.js` | Points rules and recompute. Bo3/Bo5: 3 exact score, 1 right winner, 0 wrong. Bo1: 1 right winner, 0 wrong. |
| `server/services/esportsApi.js` | Talks to the LoL Esports API and parses its response. The only file that knows the API format. |
| `server/services/sync.js` | Saves API matches to the DB, scores finished ones, runs on a timer. |
| `server/routes/leaderboard.js` | `GET /api/leaderboard`, `GET /api/users/:id/predictions` |
| `web/index.html` | Page shell. Loads fonts and `src/main.js`. |
| `web/vite.config.js` | Vite setup. Dev server proxies `/api` to the backend. |
| `web/src/main.js` | Mounts the Svelte app. |
| `web/src/App.svelte` | Header + switches between Login and Matches. |
| `web/src/Login.svelte` | Join / log in form. |
| `web/src/Matches.svelte` | Match list: filter, day groups, polling, optimistic save. On the **All** tab, two switches: hide finished matches (off by default) and hide matches with no known team (on by default). |
| `web/src/MatchCard.svelte` | One match: teams, status, score picker, everyone's picks. |
| `web/src/Admin.svelte` | Admin page: add match, set result, delete, rescore, manage admins. |
| `scripts/makeadmin.js` | Make a user an admin from the terminal. |
| `scripts/seed-mock.js` | Builds the fake-data database for browser testing and checks scoring. |
| `scripts/dev-mock.js` | Starts the app on the fake data (`npm run dev:mock`), with the fake match clock. |
| `scripts/mock-simulator.js` | The fake clock: a match goes live at its start and finishes 1 minute later. |
| `scripts/mock-soon.js` | Restarts that match's countdown (`npm run mock:soon`). |
| `web/src/ScoringInfo.svelte` | The **i** button in the header and its "how scoring works" dialog. |
| `web/src/lib/rules.js` | Point values shown in that dialog (a test keeps them equal to the server's). |
| `web/src/Leaderboard.svelte` | Ranking table. Tap a row to open that player. |
| `web/src/Player.svelte` | One player's locked picks, results, points. Newest match first. |
| `web/src/lib/router.svelte.js` | Tiny router: reads the `#/...` part of the URL. |
| `web/src/lib/saveQueue.js` | Saves picks one at a time per match, so the stored pick is always the last click. |
| `web/src/lib/api.js` | All backend calls in one place. |
| `web/src/lib/match.js` | Open/TBD checks, valid scores per best-of. |
| `web/src/lib/groups.js` | Groups matches into one block per day (each day exactly once). |
| `web/src/lib/visibility.js` | Which matches the list shows, given the tab and the two switches. |
| `web/src/lib/time.js` | Local time formatting, countdown. |
| `web/src/lib/i18n.svelte.js` | Czech/English text. Use `t('key')` in templates. |
| `web/src/app.css` | Colors, fonts (CSS variables). |
| `web/public/manifest.webmanifest` | Lets phones install the app ("Add to Home Screen"): name, colors, icons. |
| `web/public/*.png`, `icon.svg` | App icons. Regenerate with `node scripts/make-icons.js`. |
| `scripts/backup.sh` | Backs up the DB, keeps 14 days, copies off the Pi with rclone. |
| `scripts/deploy.sh` | Updates the app on the Pi (backup, pull, build, restart, health check). |
| `deploy/worlds.service` | systemd service so the app starts on boot and restarts on crash. |
| `deploy/crontab.example` | The hourly backup schedule. |
| `DEPLOY.md` | Step-by-step Pi setup, Funnel, backups, restore. |
| `test/*.test.js` | Automated server and helper tests (run with `npm test`) |
| `web/test/pages.test.js` | Page tests: the real app rendered in a fake browser, to catch pages that crash or hang. |
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

Run these in the project folder (the one with `package.json`).

**How npm works, in short:** `package.json` lists the project's packages and a set of
named shortcuts called *scripts*. `npm run <name>` runs a script; `start` and `test` are
special and don't need `run`. This project has two `package.json` files: the root one
(the server) and `web/package.json` (the website). `npm --prefix web <command>` means
"run that command as if I were inside `web/`", so you don't have to `cd`.
A `--` passes extra words on to the script (`npm run mock:soon -- 0.5`).

| Command | What it does |
|---|---|
| `npm install` | Downloads the packages listed in `package.json` into `node_modules/`. Run once after cloning, and again when packages change. |
| `npm --prefix web install` | The same for the website's packages (`web/node_modules/`). |
| `npm start` | Starts the real server once (uses `.env` and `data/app.db`). This is what the Pi runs. |
| `npm run dev` | Starts the server and restarts it whenever you edit a server file. |
| `npm --prefix web run build` | Turns the website source into the files in `web/dist/`, which the server serves. Run after changing anything in `web/src`. |
| `npm --prefix web run dev` | Website dev server with instant reload (needs the backend running too). |
| `npm test` | Runs all automated tests: server and helper tests, then the page tests. Run before committing. |
| `npm --prefix web test` | Runs only the page tests. |
| `npm run seed:mock` | Creates the fake-data database `data/mock.db` (never touches real data). |
| `npm run dev:mock` | Starts the app on the fake data at port 3001, with a fake match clock. |
| `npm run mock:soon` | Restarts the "match starts in 2 minutes" countdown in the fake data. |
| `npm run makeadmin -- <name>` | Makes that player an admin (add `--revoke` to undo). |

## Try it with fake data

```bash
npm run seed:mock        # builds ./data/mock.db (safe: never touches app.db)
npm --prefix web run build
npm run dev:mock         # open http://127.0.0.1:3001
```

It uses port **3001**, so it can run next to your normal server on 3000 (which
shows your real data). If you see `EADDRINUSE`, something else is on that port:
find it with `lsof -i :3001`. With the Vite dev server, use `API_PORT=3001 npm run dev`
inside `web/`.

Log in with PIN `123456` as `Alice`, `Bob`, `Cecilie`, `David`, `Eva`, `Filip`,
`Karel` (admin, visible) or `Organizer` (admin, hidden). Invite code: `mock`.

It contains finished, live, open, half-decided and undecided matches (including one with two long team names and logos, the tightest case on a phone), plus picks that
exercise every score (exact, winner only, wrong, no pick) and a four-way tie.
Re-run `seed:mock` any time to reset it and refresh the dates (restart `dev:mock`
afterwards). `npm test` re-checks the points against hand-computed values.

**Watch a match lock, go live and finish:** the match C9 vs KC starts 2 minutes after
seeding, and `dev:mock` runs a fake match clock:

| When | What happens |
|---|---|
| 2 min after seeding | the score buttons disappear, the card shows **Uzamčeno**, then **● Živě** |
| within 30 s | everyone's picks appear (**Tipy všech**) |
| 1 min after the start | it finishes **1–0**, picks are scored, points show on the card |

The leaderboard changes too (Alice and Cecilie gain 1 point each: it is a best-of-1, so
the right winner is worth 1). The page refreshes every
30 seconds, so each step can appear up to 30 s late.

To repeat it while the app is running: `npm run mock:soon` (starts in 2 minutes) or
`npm run mock:soon -- 0.5` (30 seconds). That clears the result and points again.
The clock only exists in `dev:mock`; the real app gets this from the API sync.

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

## Install on a phone

- **iPhone (Safari):** Share > **Add to Home Screen**.
- **Android (Chrome):** menu > **Install app** / **Add to Home screen**.

It opens full screen like an app. Hashed files in `/assets/` are cached for a year; `index.html` is re-checked each visit, so updates show up right after a deploy.

## Automatic sync

- Needs `ESPORTS_API_KEY` in `.env` (without it, sync is off and you add matches by hand).
- Runs once on start, then only around matches:
  - Up to 3 h before a match: every 10 min.
  - While a match is live: every 3 min.
  - Otherwise it sleeps (it re-checks the schedule every 6 h only if no match is upcoming).
- Times are set in `server/services/sync.js` (`PRE_WINDOW_MS`, `PRE_INTERVAL_MS`, `LIVE_INTERVAL_MS`).
- Admin tab > **Sync now** runs it immediately.
- If the API is down, the app keeps its last data and logs the error.
- Matches you set by hand are never overwritten by the sync.
- Picks and results are stored per team position. If Riot later lists the same two teams the other way round, the sync turns its data (teams, logos and score) around to our order. If the teams are really different, it ignores that update and logs a warning (look for "different teams" in `journalctl -u worlds`); fix that match in the Admin tab.

## Key rules (why the code looks the way it does)

- Predictions lock at start time, enforced on the server only.
- `locked_at` is set once and never cleared.
- Passwords (PINs) are hashed, never stored as text.
- Times are stored in UTC.
- Points are recomputed from picks + result, never added up, so rescoring is safe.
- Best-of-1: the right winner earns 1 point, not 3, because the score *is* the winner. So "exact hits" on the leaderboard only count Bo3/Bo5 picks.
- To deselect a pick, tap the chosen score again or press **Zrušit tip** (Clear pick). Only possible until the match starts.
- A pick shows **Saving…** until the server confirms it, then **✓ Saved 14:32** (the time comes from the database). If saving fails, the card goes back to the pick the server really has and shows an error.
- Other players' picks are visible only after a match locks.
- "Hidden" is a separate flag from "admin": hidden players are left out of the leaderboard and the shared picks. `makeadmin` hides your account by default; friends you make admin stay visible unless you hide them.
- Team logos come from the API (stored as https URLs) and are shown next to team names.
