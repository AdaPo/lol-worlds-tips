# Worlds Tipping App: Implementation Plan

A small web app where friends predict series scores for the League of Legends Worlds 2026 matches. Matches and results sync automatically from the LoL Esports API, points are calculated automatically, and everything runs on a Raspberry Pi exposed through Tailscale Funnel.

---

## 1. Overview

**Goals**
- Friends join with an invite code and a name + PIN.
- Matches appear automatically; predictions lock at match start.
- Results and points are computed automatically; admin can override.
- Leaderboard with a per-match breakdown.

**Stack**
| Layer | Choice |
|---|---|
| Backend | Node.js (LTS) + Fastify |
| Database | SQLite via `better-sqlite3` (single file) |
| Frontend | Svelte + Vite (static build served by Fastify) |
| Hosting | Raspberry Pi, `systemd` service |
| Public access | Tailscale Funnel (HTTPS) |
| Match data | Unofficial LoL Esports API (`getSchedule`), manual admin fallback |

**Architecture**
```
Friends' phones --HTTPS--> Tailscale Funnel --> Fastify (localhost:3000)
                                                  |-- serves static frontend
                                                  |-- REST API (/api/*)
                                                  |-- sync job (cron-like timer)
                                                  '-- SQLite file (data/app.db)
Sync job --> LoL Esports API (getSchedule)
```

Single process, single DB file. No Docker, no separate frontend server.

---

## 2. Repository Structure

```
worlds-tipping/
  server/
    index.js            # Fastify bootstrap, static serving
    db.js               # better-sqlite3 setup + migrations
    auth.js             # sessions, invite code, admin token
    routes/
      auth.js
      matches.js
      predictions.js
      leaderboard.js
      admin.js
    services/
      scoring.js        # pure scoring functions
      sync.js           # LoL Esports API sync job
      esportsApi.js     # API client + response parsing (single place to fix)
  web/                  # Svelte + Vite frontend
    src/
      routes/ or pages/
      lib/api.js
  data/                 # app.db lives here (gitignored)
  scripts/
    deploy.sh
    backup.sh
  .env                  # INVITE_CODE, ADMIN_TOKEN, ESPORTS_LEAGUE_ID, ESPORTS_API_KEY
  package.json
```

---

## 3. Database

All timestamps stored in **UTC** (ISO 8601 strings). Convert to local time in the UI.

```sql
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  pin_hash      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE matches (
  id            TEXT PRIMARY KEY,          -- API match ID (or 'manual-<n>')
  stage         TEXT,                      -- e.g. Play-In, Swiss, Quarterfinal
  team1         TEXT,                      -- NULL/'TBD' until known
  team2         TEXT,
  team1_code    TEXT,
  team2_code    TEXT,
  best_of       INTEGER NOT NULL,          -- 1, 3 or 5
  start_time    TEXT NOT NULL,             -- UTC
  locked_at     TEXT,                      -- set the first time the match locks; never cleared
  state         TEXT NOT NULL DEFAULT 'unstarted', -- unstarted | inProgress | completed
  team1_wins    INTEGER,
  team2_wins    INTEGER,
  manual_override INTEGER NOT NULL DEFAULT 0,      -- 1 = sync must not overwrite result
  scored_at     TEXT,                      -- set once points were calculated
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE predictions (
  user_id       INTEGER NOT NULL REFERENCES users(id),
  match_id      TEXT NOT NULL REFERENCES matches(id),
  pred_team1    INTEGER NOT NULL,
  pred_team2    INTEGER NOT NULL,
  points        INTEGER,                   -- NULL until scored
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, match_id)
);

CREATE TABLE sessions (
  token         TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  expires_at    TEXT NOT NULL
);

CREATE TABLE settings (
  key           TEXT PRIMARY KEY,
  value         TEXT
);

CREATE INDEX idx_matches_start ON matches(start_time);
CREATE INDEX idx_predictions_match ON predictions(match_id);
```

**SQLite settings** (run on startup): `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`

**Migrations:** keep a `schema_version` in `settings` and a simple ordered list of SQL migration strings applied on boot.

---

## 4. Backend

### 4.1 Auth
- **Join:** `POST /api/auth/join` with `{ inviteCode, name, pin }`. Creates the user (PIN hashed with `bcryptjs` or `crypto.scrypt`).
- **PIN:** at least 6 digits. Names are public on the leaderboard, so a 4-digit PIN (10,000 options) is too easy to guess.
- **Login:** `POST /api/auth/login` with `{ name, pin }`.
- **Session:** random token stored in `sessions`, sent as an `HttpOnly`, `SameSite=Lax` cookie, 30-day expiry. Set `Secure` only in production; some browsers (notably Safari) drop `Secure` cookies on `http://localhost`.
- **Rate limiting:** `@fastify/rate-limit` on auth routes, keyed by IP (e.g. 10 attempts / 10 min) and additionally by account name for login (e.g. lock the name for 15 min after 5 failed attempts).
  - Behind Tailscale Funnel, requests may reach Fastify from `127.0.0.1`, so an IP-only limit would treat all friends as one client. Verify whether Funnel forwards the client IP in `X-Forwarded-For`; if it does, enable Fastify's `trustProxy`.
- **Admin:** a logged-in user with `users.is_admin = 1` (set with `npm run makeadmin -- <name>`, then managed from the admin page), or a request with header `x-admin-token` matching `ADMIN_TOKEN` in `.env` as an emergency fallback. Admins cannot change their own admin flag via the API.
- Compare `ADMIN_TOKEN` and `INVITE_CODE` with `crypto.timingSafeEqual`, not `===`.

### 4.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/join` | Register with invite code |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/me` | Current user |
| GET | `/api/matches` | Matches with my prediction; others' predictions only for locked matches |
| PUT | `/api/predictions/:matchId` | Create/update my prediction (rejected if locked) |
| GET | `/api/leaderboard` | Total points, exact hits, correct winners |
| GET | `/api/users/:id/predictions` | A user's predictions for locked/finished matches |
| POST | `/api/admin/matches` | Add manual match |
| DELETE | `/api/admin/matches/:id` | Delete a manual match (e.g. once the API lists the same match) |
| PUT | `/api/admin/matches/:id/result` | Set result manually (sets `manual_override`) |
| POST | `/api/admin/sync` | Trigger sync now |
| POST | `/api/admin/rescore` | Recompute all points |

### 4.3 Prediction rules (server-side only)
- A match is locked if `locked_at` is set, `now >= start_time`, or `state != 'unstarted'`. The first time any of these is true, set `locked_at`; it is never cleared.
  - Reason: the sync job can move `start_time` later. Without `locked_at`, a rescheduled match would reopen after everyone's picks were already visible.
- Reject if the match is locked.
- Reject if either team is TBD.
- Validate the score against `best_of`:
  - Bo1: 1-0, 0-1
  - Bo3: 2-0, 2-1, 1-2, 0-2
  - Bo5: 3-0, 3-1, 3-2, 2-3, 1-3, 0-3
- Generic check: exactly one side equals `ceil(best_of / 2)` and the other is below it.

### 4.4 Scoring (`services/scoring.js`)
Pure functions, easy to unit test.

```js
export function scorePrediction(pred, result) {
  const predWinner = pred.team1 > pred.team2 ? 1 : 2;
  const realWinner = result.team1 > result.team2 ? 1 : 2;
  if (pred.team1 === result.team1 && pred.team2 === result.team2) return 3; // exact score
  if (predWinner === realWinner) return 1;                                   // winner only
  return 0;
}
```

- **Open decision, Bo1 weighting:** in a Bo1 the correct winner is always the exact score, so every correct Bo1 pick earns 3 points, while a correct Bo3/Bo5 winner usually earns 1. Swiss Bo1s would dominate the leaderboard. Decide whether that's intended (one option: cap Bo1 at 1 point).
- Run when a match becomes `completed` (and `scored_at IS NULL`, or on rescore).
- `POST /api/admin/rescore` recomputes **all** completed matches, not only unscored ones, so it fixes points after a manual result override.
- **Idempotent:** always recompute `points` from stored predictions + result; never increment totals.
- Leaderboard = `SUM(points)` per user, computed by query (no stored totals).
- Optional bonus: tournament winner pick, locked before the Swiss stage.

### 4.5 Sync job (`services/sync.js`)
1. Every 5 minutes (every 1 minute when a match is in progress or starts within an hour), call `getSchedule` for the Worlds league.
2. Follow pagination tokens if present. `getSchedule` pages in both directions (older and newer), so follow both.
3. For each event of type match: upsert into `matches` by API ID (teams, best_of, start_time, state).
   - Once a match has predictions, do not change `team1`/`team2` (or their codes). Predictions are stored by position, so a swapped team order from the API would flip every pick. Log a warning instead and fix via admin if needed.
   - Updating `start_time` never clears `locked_at`.
4. If state is `completed` and `manual_override = 0`: store `team1_wins` / `team2_wins`, then score predictions inside one DB transaction.
5. Never overwrite rows where `manual_override = 1`.
6. Wrap everything in try/catch, log failures, and keep the last good data. The app must work when the API is down.
7. Keep response parsing in `esportsApi.js` only, so API format changes are a one-file fix.
8. If an admin added a manual match and the API later lists the same match, delete the manual one via `DELETE /api/admin/matches/:id` to avoid duplicates.

> The LoL Esports API is unofficial and undocumented by Riot, so it can change without notice. Keep the admin override as a safety net.
>
> **Verified 2026-10-15 against the live API:**
> - `GET https://esports-api.lolesports.com/persisted/gw/getSchedule?hl=en-US&leagueId=98767975604431411` (Worlds), with the public community key in the `x-api-key` header (403 without it).
> - The first page holds ~80 events centred on "now" and includes the previous year's Worlds, so imports are filtered with `ESPORTS_SINCE` (default: January 1st of the current year).
> - `pages.newer` is followed until `null`; `pages.older` only while a page still reaches back to `ESPORTS_SINCE`.
> - Per match: `match.id`, `blockName` (stage), `match.strategy.count` (best of), `startTime`, `state` (`unstarted` / `completed`; `inProgress` is handled but not yet observed), `match.teams[].name|code|result.gameWins`. TBD teams arrive as name/code `TBD` with `result: null`.
> - `gameWins` is 0 before a match is completed, so results are only trusted when `state` is `completed`.

Scheduling: a `setTimeout` loop inside the server process (each run schedules the next, so the delay can switch between 5 min and 1 min). Guard against overlapping runs with an `isRunning` flag.

### 4.6 Config (`.env`)
```
PORT=3000
INVITE_CODE=change-me
ADMIN_TOKEN=long-random-string
ESPORTS_LEAGUE_ID=...
# from community docs
ESPORTS_API_KEY=...
DB_PATH=./data/app.db
```
Keep comments on their own lines. systemd's `EnvironmentFile` does not strip trailing `# comments`, so they would become part of the value.

No session secret is needed: sessions are random tokens stored in the database, not signed cookies.

---

## 5. Frontend

Mobile-first; most friends will use phones.

### 5.1 Pages
1. **Join / Login:** invite code, name, PIN.
2. **Matches (home):**
   - Grouped by day, with the next matches first.
   - Match card: teams, stage, best-of, start time in local time, countdown.
   - Score picker (buttons for the valid scores, not free text).
   - States: open (editable), locked (shows my pick, and everyone's picks), finished (result + points earned).
   - Filter: All / Open / Finished.
3. **Leaderboard:** rank, name, points, exact hits, correct winners.
4. **Player view:** a friend's picks per match (locked matches only).
5. **Admin** (hidden, token-based): add matches, set results, trigger sync/rescore.

### 5.2 Behaviors
- Optimistic UI when saving a prediction, with an error toast if the server rejects it (e.g. locked).
- Poll `/api/matches` every 30-60 s while the page is open (no websockets needed).
- Show times in the browser's timezone.
- "Add to Home Screen" support: `manifest.webmanifest`, icons, `theme-color`.
- Handle TBD teams: show "TBD" and disable prediction.

### 5.3 Build and serve
- `npm run build` in `web/` outputs to `web/dist`.
- Fastify serves it with `@fastify/static`, with SPA fallback to `index.html` for non-`/api` routes.
- Plain Svelte (not SvelteKit) has no built-in routing. Use a small hash-based switch in `App.svelte` (e.g. `#/matches`, `#/leaderboard`, `#/player/3`, `#/admin`) or a package like `svelte-spa-router`.

---

## 6. Implementation Steps

| Phase | Work | Time |
|---|---|---|
| 0 | Repo, Fastify, SQLite, migrations, `.env` | 0.5 h |
| 1 | Auth (join/login/session), rate limit | 1.5 h |
| 2 | Matches + predictions endpoints, lock logic, validation | 2 h |
| 3 | Scoring + leaderboard + unit tests | 1.5 h |
| 4 | Frontend: join, matches list, score picker | 3 h |
| 5 | Leaderboard + player views | 1.5 h |
| 6 | Admin endpoints + admin page | 1.5 h |
| 7 | API sync job + parsing + overrides | 3 h |
| 8 | Pi deployment, Funnel, backups | 1.5 h |
| 9 | Polish: PWA manifest, styling, error states | 2 h |

Total: roughly 15-18 hours. Phases 0-3 + 6 give a working app with manual data; phase 7 adds automation.

**Tests worth writing:** scoring function, score validation per best-of, lock-time enforcement, sync idempotency (running twice gives the same points).

---

## 7. Managing the Raspberry Pi

### 7.1 Initial setup
```bash
# OS: Raspberry Pi OS Lite (64-bit). Enable SSH in the imager.
sudo apt update && sudo apt full-upgrade -y
sudo hostnamectl set-hostname worlds
sudo timedatectl set-timezone Europe/Prague   # DB stays in UTC regardless

# Node.js LTS (via NodeSource or nvm), plus tools
sudo apt install -y git sqlite3
node -v && npm -v

# App
git clone <your-repo> ~/worlds-tipping
cd ~/worlds-tipping && npm ci
cd web && npm ci && npm run build && cd ..
cp .env.example .env && nano .env
```

### 7.2 App as a systemd service
Create `/etc/systemd/system/worlds.service`:
```ini
[Unit]
Description=Worlds Tipping App
After=network-online.target time-sync.target
Wants=network-online.target time-sync.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/worlds-tipping
EnvironmentFile=/home/pi/worlds-tipping/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```
Adjust `User`, paths, and the `node` path (`which node`).

`time-sync.target` matters: most Pis have no battery-backed clock, so until NTP syncs after boot, the clock (and therefore prediction locking) can be wrong.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now worlds
```

Everyday commands:
```bash
sudo systemctl status worlds        # is it running?
sudo systemctl restart worlds       # after deploy/config change
sudo systemctl stop worlds
journalctl -u worlds -f             # live logs
journalctl -u worlds --since "1 hour ago"
```

### 7.3 Tailscale Funnel
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# In the admin console: enable MagicDNS + HTTPS certificates, allow Funnel
sudo tailscale funnel --bg 3000
tailscale funnel status             # shows your public URL
```
Management:
```bash
tailscale status                    # connection state
sudo tailscale funnel reset         # remove the Funnel config
sudo systemctl status tailscaled    # Tailscale daemon
```
Share the URL + invite code with friends.

### 7.4 Deploying updates
`scripts/deploy.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
cd ~/worlds-tipping
git pull --ff-only
npm ci --omit=dev
(cd web && npm ci && npm run build)
sudo systemctl restart worlds
sleep 2
curl -fsS http://localhost:3000/api/health && echo "OK"
```
Add a `/api/health` route that returns `{ ok: true }` and checks the DB. Back up the DB before schema changes.

`sudo systemctl restart` prompts for a password when run over SSH. Allow only that command without a password (`sudo visudo -f /etc/sudoers.d/worlds`):
```
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart worlds
```

### 7.5 Backups (important: SD cards fail)
`scripts/backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=~/backups
mkdir -p "$DEST"
sqlite3 ~/worlds-tipping/data/app.db ".backup '$DEST/app-$(date +%F-%H%M).db'"
find "$DEST" -name 'app-*.db' -mtime +14 -delete
# Copy off the Pi (required: backups on the same SD card don't survive a card failure)
rsync -a "$DEST/" user@other-machine:/backups/worlds/
```
Use the SQLite `.backup` command (safe while the app is running), not a plain `cp`. The `rsync` target needs SSH key access from the Pi.

**As built:** `scripts/backup.sh` copies off the device with `rclone` instead of `rsync` (set `BACKUP_REMOTE` in `.env`, e.g. `gdrive:worlds-tips`) and warns loudly if it is unset. Setup, cron and restore steps are in `DEPLOY.md`.

Cron (`crontab -e`): hourly during the tournament (switch to nightly, e.g. `0 3 * * *`, afterwards):
```
0 * * * *  /home/pi/worlds-tipping/scripts/backup.sh
```
Test a restore once: stop the service, copy a backup over `data/app.db`, start the service.

### 7.6 Monitoring and maintenance
- **Uptime check:** a free external monitor (e.g. UptimeRobot) on the Funnel URL's `/api/health`, with notifications to your phone.
- **Disk:** `df -h` (keep >20% free). **Memory:** `free -h`. **Temperature:** `vcgencmd measure_temp`.
- **Logs:** journald rotates automatically; limit with `SystemMaxUse=200M` in `/etc/systemd/journald.conf`.
- **OS updates:** `sudo apt update && sudo apt upgrade -y` weekly; avoid big upgrades or reboots during matches.
- **Power:** use a good power supply; a cheap one is a common cause of SD corruption. A small UPS is optional.
- **Auto-start check after reboot:** `sudo reboot`, then verify `systemctl status worlds` and `tailscale funnel status`.
- **Optional:** boot from an SSD or USB drive instead of the SD card for reliability.

### 7.7 Security checklist
- SSH key login only; disable password auth in `/etc/ssh/sshd_config`.
- Keep `.env` out of git; `chmod 600 .env`.
- Long random `ADMIN_TOKEN`, compared with `crypto.timingSafeEqual`.
- Rate limiting on auth endpoints (per IP and per name); change the invite code if it leaks.
- PINs of at least 6 digits.
- Funnel exposes only the app port; SSH stays reachable via Tailscale only (not the public Funnel).
- Optional: `sudo apt install unattended-upgrades` for security patches.

### 7.8 Troubleshooting
| Symptom | Check |
|---|---|
| Site not reachable | `tailscale funnel status`, `systemctl status tailscaled`, Pi network/power |
| 502 / blank page | `systemctl status worlds`, `journalctl -u worlds -n 100` |
| Matches not updating | Logs of the sync job; trigger `POST /api/admin/sync`; use manual override |
| Points wrong | Fix result via admin, then `POST /api/admin/rescore` |
| DB locked errors | Confirm WAL mode; only one app process running |
| After reboot nothing works | `systemctl is-enabled worlds tailscaled` |

---

## 8. Risks and Fallbacks
- **API changes or outage:** parsing isolated in one module; admin override for results; cached data remains visible.
- **Home internet/power outage:** accept for a hobby app, or move the same code to a small VPS (copy the DB file and `.env`).
- **Forfeits, remakes, odd results:** handle via admin override and rescore.
- **Cheating:** predictions lock server-side at start time; others' picks are hidden until lock.

---

## 9. Optional Extras
- Tournament winner / finalist bonus picks.
- Web push or Telegram/Discord reminder for unpredicted matches.
- Spoiler-free mode (hide results until revealed).
- Stage multipliers (e.g. knockout matches worth more).
