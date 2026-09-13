# CLAUDE.md — CHHBot (Tusky)

Discord bot for the Utah Mammoth hockey server. See `CODEBASE_GUIDE.md` for code navigation and `README.md` for user-facing command docs.

## Setup (local)

```bash
git clone https://github.com/standw7/CHHBot.git && cd CHHBot
npm install
cp .env.example .env   # DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID (see src/config/environment.ts)
npm run dev            # tsx src/index.ts
npm run build          # tsc → dist/ (dist/ is committed; the VM does not build)
```

## Production

- **VM**: Oracle Ubuntu 22.04, 1 GB RAM + 2 GB swap. `ssh -i ~/Downloads/ssh-key-2026-02-03.key ubuntu@158.101.12.125`
- **Path**: `/home/ubuntu/CHHBot`, run as `pm2` app `tusky` from `dist/index.js`
- **RSSHub** for Twitter feeds runs in docker (`rsshub-rsshub-1`, `restart=always`) on `localhost:1200`

### Deploy

```bash
npm run build && git add dist && git commit && git push      # locally
ssh ... 'cd ~/CHHBot && git pull && pm2 restart tusky'       # on VM
```

### Process supervision (three layers)

1. **systemd runs PM2** — `pm2-ubuntu.service` with `ops/pm2-ubuntu.override.conf`: `Restart=always`, no `ExecStop` (the pm2 CLI spawns a rogue daemon when none is running), and `ExecStartPre` that kills any escaped daemon/bot and clears stale sockets. If PM2 dies, systemd kills the orphaned bot and resurrects both.
2. **In-app health monitor** — `src/services/healthMonitor.ts` exits with code 1 if the Discord gateway has not been Ready for 5 minutes, so PM2 restarts the process instead of leaving a zombie.
3. **External watchdog** — `tusky-watchdog.timer` runs `ops/tusky-watchdog.sh` every 5 minutes: restarts the service if PM2 is inactive/dead, restarts the bot if PM2 says it isn't `online` or it has no established :443 connection after a 5-minute grace period. Logs to `journalctl -t tusky-watchdog`.

Install/refresh all of it on the VM: `cd ~/CHHBot && sudo bash ops/install.sh`.

### Runbook

- Bot down / `pm2 list` empty → `sudo systemctl restart pm2-ubuntu`. **Never** run `pm2 resurrect`/`pm2 start` from a shell when the daemon is dead — that creates an unsupervised daemon outside systemd (this is how the Aug 28 2026 outage went unnoticed for 2 weeks).
- Logs: `~/.pm2/logs/tusky-out.log`, `~/.pm2/logs/tusky-error.log`, `sudo journalctl -u pm2-ubuntu`, `sudo journalctl -t tusky-watchdog`
- Memory: `free -m`, `sudo dmesg -T | grep -i oom`. RSSHub is the big consumer (~250–300 MB).
