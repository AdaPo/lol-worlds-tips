# Deploy to the Raspberry Pi

Assumes user `pi` and `~/worlds-tipping`. Change paths in `deploy/worlds.service` if different.

## 1. Prepare the Pi

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git sqlite3
# Node 20.12+ (LTS): install via NodeSource or nvm, then:
node -v
```

## 2. Install the app

```bash
git clone <your-repo-url> ~/worlds-tipping
cd ~/worlds-tipping
npm ci --omit=dev
(cd web && npm ci && npm run build)
cp .env.example .env && nano .env && chmod 600 .env
```

Set at least: `INVITE_CODE`, `ADMIN_TOKEN` (long random), `ESPORTS_API_KEY`, `BACKUP_REMOTE`.

If `npm ci` fails building `better-sqlite3`: `sudo apt install -y build-essential python3`, then retry.

## 3. Run as a service

```bash
sudo cp deploy/worlds.service /etc/systemd/system/worlds.service
sudo nano /etc/systemd/system/worlds.service   # check User, paths, node path
sudo systemctl daemon-reload
sudo systemctl enable --now worlds
curl localhost:3000/api/health                 # {"ok":true}
```

Logs: `journalctl -u worlds -f`

## 4. Make yourself admin

Open the app, join, then:

```bash
cd ~/worlds-tipping && npm run makeadmin -- <your name>
```

## 5. Public access (Tailscale Funnel)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
# Admin console: enable MagicDNS + HTTPS, allow Funnel
sudo tailscale funnel --bg 3000
tailscale funnel status          # your public URL
```

### Check whether Funnel forwards the client IP

Rate limiting is per IP. If every friend appears as `127.0.0.1`, they would share one limit.

1. From your phone on mobile data, open the Funnel URL.
2. `journalctl -u worlds -n 5` and look at `remoteAddress`.
3. If it is `127.0.0.1`: set `TRUST_PROXY=true` in `.env`, `sudo systemctl restart worlds`, repeat.
   - Now your real IP shows: keep `TRUST_PROXY=true`.
   - Still `127.0.0.1`: set `TRUST_PROXY=false` and `AUTH_RATE_LIMIT_MAX=100`. Each name still locks after 5 failed logins.

## 6. Backups with rclone

```bash
curl https://rclone.org/install.sh | sudo bash
rclone config                    # new remote, e.g. "gdrive"
rclone lsd gdrive:               # test
```

On a headless Pi, Google Drive login needs a browser: run `rclone authorize "drive"` on your own computer and paste the result when asked.

Optional encryption (recommended for a shared account): create a `crypt` remote on top of `gdrive:worlds-tips` in `rclone config`, and use that remote.

Then:

```bash
nano ~/worlds-tipping/.env       # BACKUP_REMOTE=gdrive:worlds-tips
~/worlds-tipping/scripts/backup.sh
rclone ls gdrive:worlds-tips     # the file is there
crontab -e                       # paste deploy/crontab.example
```

Also keep a copy of `.env` somewhere safe (password manager). It is not in the backup.

### Restore (test this once)

```bash
sudo systemctl stop worlds
rclone copy gdrive:worlds-tips/app-YYYY-MM-DD-HHMM.db /tmp/
cp /tmp/app-YYYY-MM-DD-HHMM.db ~/worlds-tipping/data/app.db
sudo systemctl start worlds
```

## 7. Update the app

```bash
~/worlds-tipping/scripts/deploy.sh
```

It backs up the DB first, then pulls, installs, builds, restarts, and checks health. To allow the restart without a password prompt:

```bash
sudo visudo -f /etc/sudoers.d/worlds
# pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart worlds
```

## 8. Tell your friends

Send them the Funnel URL and the invite code. To get it as an app icon:

- **iPhone (Safari):** Share > Add to Home Screen.
- **Android (Chrome):** menu > Install app.

## 9. Checks

| Symptom | Check |
|---|---|
| Site unreachable | `tailscale funnel status`, `systemctl status tailscaled` |
| Blank page or 502 | `systemctl status worlds`, `journalctl -u worlds -n 100` |
| No matches | `ESPORTS_API_KEY` set? Admin tab > Sync now shows the error |
| Wrong points | Fix the result in the Admin tab, then Rescore all |
| After a reboot | `systemctl is-enabled worlds tailscaled` |
| Backups missing | `cat ~/worlds-backup.log`, `rclone lsd <remote>:` |

Also: monitor `/api/health` with a free uptime checker (e.g. UptimeRobot), and avoid OS upgrades or reboots during matches.
