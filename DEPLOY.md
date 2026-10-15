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

### Restore (test this once)

From the project folder:

```bash
sudo systemctl stop worlds
rclone ls gdrive:worlds-tips                       # pick a file name
rclone copy gdrive:worlds-tips/app-YYYY-MM-DD-HHMM.db /tmp/
cp /tmp/app-YYYY-MM-DD-HHMM.db data/app.db
sudo systemctl start worlds
```

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

Also: monitor `/api/health` with a free uptime checker (e.g. UptimeRobot), and avoid OS upgrades or reboots during matches.
