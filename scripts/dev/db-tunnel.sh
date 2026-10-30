#!/usr/bin/env bash
# SSH tunnel to Postgres on the DB server, so local dev works from any network
# (phone hotspot, new Wi-Fi) without allow-listing this Mac's IP in pg_hba.conf.
#   127.0.0.1:55432 on this Mac -> 127.0.0.1:5432 on the server (over SSH as deploy).
# On the server the connection comes from 127.0.0.1, which pg_hba.conf already allows
# for password logins (host all all 127.0.0.1/32 scram-sha-256); no server change.
# The repo-root .env points APP_ / SOURCE_ / API_DATABASE_URL at 127.0.0.1:55432.
#
# Starts a background loop that reconnects when the network drops (hotspot sleep,
# switching networks); does nothing if the tunnel is already up. apps/admin and apps/api
# run this from `npm run dev`; ETL scripts and psql need it running too.
#
# Usage: scripts/dev/db-tunnel.sh          start (idempotent)
#        scripts/dev/db-tunnel.sh status
#        scripts/dev/db-tunnel.sh stop
set -euo pipefail
HOST=deploy@5.161.100.126
LPORT=55432
PIDFILE="${TMPDIR:-/tmp}/hdchop-db-tunnel.pid"
LOG="${TMPDIR:-/tmp}/hdchop-db-tunnel.log"

up() { nc -z 127.0.0.1 "$LPORT" >/dev/null 2>&1; }
running() { [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

case "${1:-start}" in
  status)
    if up; then echo "db tunnel up on 127.0.0.1:$LPORT"; else echo "db tunnel down (log: $LOG)"; exit 1; fi ;;
  stop)
    if running; then pkill -P "$(cat "$PIDFILE")" 2>/dev/null || true; kill "$(cat "$PIDFILE")" 2>/dev/null || true; fi
    rm -f "$PIDFILE"; echo "db tunnel stopped" ;;
  start)
    if up; then exit 0; fi
    if ! running; then
      nohup bash -c "
        while true; do
          ssh -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 \
              -o ConnectTimeout=10 -L 127.0.0.1:$LPORT:127.0.0.1:5432 $HOST
          echo \"\$(date '+%F %T') tunnel exited (\$?), reconnecting\"
          sleep 3
        done" >>"$LOG" 2>&1 &
      echo $! > "$PIDFILE"
    fi
    for _ in $(seq 1 30); do up && { echo "db tunnel up on 127.0.0.1:$LPORT"; exit 0; }; sleep 0.5; done
    echo "db tunnel did not come up in 15s; see $LOG" >&2; exit 1 ;;
  *) echo "usage: $0 [start|status|stop]" >&2; exit 2 ;;
esac
