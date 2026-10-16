# Deploy to the Raspberry Pi

Run the commands from inside the project folder (the folder you cloned), unless a step says
otherwise. The folder name and your user name don't matter: nothing here is hard-coded to
`~/worlds-tipping` or to the user `pi`.

## 1. Prepare the Pi

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git sqlite3 curl
# Node 20.12+ (LTS): install via NodeSource, not nvm, then:
node -v
```

## 2. Install the app

```bash
git clone <your-repo-url>
cd <the folder git created>        # named after the repo, e.g. lol-worlds-tips
npm ci --omit=dev
(cd web && npm ci && npm run build)
cp .env.example .env && nano .env && chmod 600 .env
```

Set at least: `INVITE_CODE`, `ADMIN_TOKEN` (long random), `ESPORTS_API_KEY`, `BACKUP_REMOTE`.

If `npm ci` fails building `better-sqlite3`: `sudo apt install -y build-essential python3`, then retry.

## 3. Run as a service

From the project folder. The first command fills in the folder, your user and the path of
`node` automatically, so there is nothing to edit:

```bash
sed -e "s#__APP_DIR__#$(pwd)#g" -e "s#__APP_USER__#$(whoami)#g" \
    -e "s#__NODE__#$(command -v node)#g" deploy/worlds.service \
  | sudo tee /etc/systemd/system/worlds.service > /dev/null
cat /etc/systemd/system/worlds.service         # check: no "__" left, paths look right
sudo systemctl daemon-reload
sudo systemctl enable --now worlds
curl localhost:3000/api/health                 # {"ok":true}
```

Logs: `journalctl -u worlds -f`

## 4. Make yourself admin

Open the app, join, then, from the project folder:

```bash
npm run makeadmin -- <your name>
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

On a headless Pi, Google Drive login needs a browser: run `rclone authorize "drive"` on your own computer and paste the result when asked. Leave `client_id` and `client_secret` blank.

Optional encryption (recommended for a shared account): create a `crypt` remote on top of `gdrive:worlds-tips` in `rclone config`, and use that remote.

Then, from the project folder:

```bash
nano .env                        # BACKUP_REMOTE=gdrive:worlds-tips
./scripts/backup.sh              # expect "Backup OK", no warning
rclone ls gdrive:worlds-tips     # the file is there
```

Schedule it, once an hour (appends to your crontab; run it once):

```bash
(crontab -l 2>/dev/null; echo "0 * * * * $(pwd)/scripts/backup.sh >> $HOME/worlds-backup.log 2>&1") | crontab -
crontab -l                       # check there is exactly one such line
```

Also keep a copy of `.env` somewhere safe (password manager). It is not in the backup.

### Check a backup without touching live data (do this once)

Safe at any time: the app keeps running and nothing live is changed.

```bash
mkdir -p ~/restore-test
LATEST=$(rclone lsf gdrive:worlds-tips | sort | tail -n 1); echo "$LATEST"
rclone copy "gdrive:worlds-tips/$LATEST" ~/restore-test/
sqlite3 ~/restore-test/"$LATEST" "PRAGMA integrity_check; SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM predictions;"
```

Expect `ok`, then the player and pick counts (close to the live ones). To start the app on the
copy, on another port, from the project folder:

```bash
DB_PATH="$HOME/restore-test/$LATEST" PORT=3100 INVITE_CODE=test ADMIN_TOKEN=test-token-123 ESPORTS_API_KEY= node server/index.js
# in a second terminal: curl localhost:3100/api/health     then Ctrl+C
rm -rf ~/restore-test
```

### Restore for real (only if the live data is lost or broken)

From the project folder. This replaces the live database, so it keeps a copy of the current
one first and removes the old journal files that must not be mixed with the restored file:

```bash
sudo systemctl stop worlds
cp data/app.db ~/app.db.before-restore               # undo copy; skip if app.db is gone
rclone ls gdrive:worlds-tips                         # pick a file name
rclone copy gdrive:worlds-tips/app-YYYY-MM-DD-HHMM.db /tmp/
rm -f data/app.db-wal data/app.db-shm
cp /tmp/app-YYYY-MM-DD-HHMM.db data/app.db
sudo systemctl start worlds
curl localhost:3000/api/health                       # {"ok":true}
```

Picks made after that backup was taken are lost; with hourly backups that is at most an hour.

## 7. Update the app

From the project folder:

```bash
./scripts/deploy.sh
```

It backs up the DB first, then pulls, installs, builds, restarts, and checks health. To allow the restart without a password prompt, run `sudo visudo -f /etc/sudoers.d/worlds` and add this line (replace `pi` with the output of `whoami`):

```
pi ALL=(root) NOPASSWD: /usr/bin/systemctl restart worlds
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
| Service fails to start with a path error | `cat /etc/systemd/system/worlds.service`: any `__APP_DIR__` left means step 3's first command was skipped |

Also: avoid OS upgrades or reboots during matches.

## 10. Uptime alert (free)

A monitor outside your home checks the public address every few minutes and emails or pushes to
your phone when it stops answering. Because it uses the **public** address, it catches every
failure in the chain: the Pi, the app, Tailscale, and the Funnel.

On uptimerobot.com (free account) > **+ New monitor**:

| Setting | Value |
|---|---|
| Monitor type | **Keyword** (or HTTP(s)) |
| Friendly name | Worlds tipovacka |
| URL | `https://<your-funnel-address>/api/health` |
| Keyword | `"ok":true`, alert when the keyword **does not exist** |
| Monitoring interval | 5 minutes (the free minimum) |
| Alert contacts | your email, plus the UptimeRobot phone app for push alerts |

The health address answers `{"ok":true}` only when the app can reach its database. Test the
alert once: `sudo systemctl stop worlds`, wait about 10 minutes for the "down" message, then
`sudo systemctl start worlds` and wait for the "up" message.

It does not notice a stale sync or wrong data; check Admin > Sync now for that.

### When the site is down

Run this on the Pi (it prints labelled sections; paste the output when asking for help):

```bash
echo "--- uptime"; uptime -p
echo "--- app"; systemctl is-active worlds; curl -s -m 5 localhost:3000/api/health || echo "NO ANSWER"
echo "--- app log"; journalctl -u worlds -n 30 --no-pager
echo "--- disk, memory, power"; df -h / | tail -1; free -h | head -2; vcgencmd get_throttled
echo "--- tailscale"; tailscale status | head -5; tailscale funnel status
echo "--- who holds port 443"; sudo ss -ltnp | grep -E ':443\b'
```

| What you see | Meaning |
|---|---|
| `uptime` is only minutes | the Pi restarted; check power (`get_throttled` should be `0x0`) |
| app `inactive`/`failed` | read the app log, then `sudo systemctl restart worlds` |
| app fine, public address dead | Tailscale: `tailscale status`, then `sudo tailscale funnel --bg 3000` |
| port 443 held by anything but `tailscaled` | e.g. Pi-hole's web server (see "Pi-hole" below) |
| disk 100% | free space; SQLite cannot write when the disk is full |

### Pi-hole

Pi-hole 6 serves its web interface on port 443 by default, which Tailscale Funnel needs.
Keep it off 443: `sudo pihole-FTL --config webserver.port "80o,[::]:80o"` then
`sudo systemctl restart pihole-FTL` (DNS pauses for a few seconds).
