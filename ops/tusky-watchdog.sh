#!/bin/bash
# Tusky watchdog — run by tusky-watchdog.timer every 5 minutes as root.
# Restarts the PM2 service if it is dead/unresponsive, and restarts the bot
# if PM2 reports it not online or it has no live Discord connection.
set -u
PM2_USER=ubuntu
PM2_BIN=/usr/local/bin/pm2
APP=tusky
GRACE_SEC=300   # allow this long after start before requiring a Discord socket

log() { logger -t tusky-watchdog "$*"; }
pm2() { timeout 30 runuser -u "$PM2_USER" -- "$PM2_BIN" "$@"; }

restart_service() {
  systemctl reset-failed pm2-ubuntu 2>/dev/null
  systemctl restart pm2-ubuntu
}

# Never call the pm2 CLI unless systemd's daemon is alive: with no daemon the
# CLI spawns a rogue one outside the service cgroup.
if ! systemctl is-active --quiet pm2-ubuntu; then
  log "pm2-ubuntu is not active, restarting service"
  restart_service
  exit 0
fi
main=$(systemctl show pm2-ubuntu -p MainPID --value)
if [ -z "$main" ] || [ "$main" -eq 0 ] || ! kill -0 "$main" 2>/dev/null; then
  log "pm2 daemon (MainPID=$main) is not alive, restarting service"
  restart_service
  exit 0
fi

json=$(pm2 jlist 2>/dev/null)
if [ $? -ne 0 ] || [ -z "$json" ]; then
  log "pm2 jlist failed or hung, restarting pm2-ubuntu"
  restart_service
  exit 0
fi

read -r status pid uptime_ms <<<"$(printf '%s' "$json" | python3 -c '
import json, sys, time
for p in json.load(sys.stdin):
    if p["name"] == sys.argv[1]:
        env = p.get("pm2_env", {})
        up = int(time.time()*1000) - int(env.get("pm_uptime", 0))
        print(env.get("status", "missing"), p.get("pid", 0), up)
        break
else:
    print("missing 0 0")
' "$APP")"

if [ "$status" != "online" ]; then
  log "$APP status=$status, restarting"
  if [ "$status" = "missing" ]; then
    restart_service   # resurrects from dump.pm2
  else
    pm2 restart "$APP"
  fi
  exit 0
fi

if [ "$uptime_ms" -lt $((GRACE_SEC * 1000)) ]; then
  exit 0
fi

# Require at least one established TLS connection to something other than loopback.
if ! ss -Htnp state established "( dport = :443 )" 2>/dev/null | grep -q "pid=$pid,"; then
  log "$APP (pid $pid) has no established Discord connection after ${uptime_ms}ms, restarting"
  pm2 restart "$APP"
  exit 0
fi

exit 0
