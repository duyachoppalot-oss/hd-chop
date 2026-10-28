#!/usr/bin/env bash
# Let this Mac's current public IP reach Postgres on the DB server (pg_hba.conf), for
# local dev: the admin console + local API (hdchop_app on hdchop) and the ETL source
# reads (hdchop_ro on stinkin_catalog). Existing lines are kept; nothing is opened wider
# than <ip>/32. hdchop_api stays local-only (CLAUDE.md rule 6).
#   - backs up pg_hba.conf to ~/hd-chop/pg_hba.conf.bak.<ts>
#   - appends the two lines if missing
#   - checks pg_hba_file_rules for errors; reloads only if clean, else restores the backup
# Needs deploy's rw ACL on pg_hba.conf and `sudo -u postgres psql` (HANDOFF_LOG 2026-10-22).
# Usage (from the Mac): scripts/deploy/allow-db-ip.sh [ip]   (default: this Mac's public IP)
# Undo: delete the two lines tagged "# allow-db-ip <ip>" and run SELECT pg_reload_conf().
set -euo pipefail
IP="${1:-$(curl -s -m 10 https://api.ipify.org)}"
[[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bad IP: '$IP'" >&2; exit 1; }
echo "Allowing $IP/32 ..."
ssh deploy@5.161.100.126 IP="$IP" bash -s <<'REMOTE'
set -euo pipefail
HBA=/etc/postgresql/15/main/pg_hba.conf
BAK=~/hd-chop/pg_hba.conf.bak.$(date +%Y%m%d_%H%M%S)
cp "$HBA" "$BAK"
add() { grep -qE "^host[[:space:]]+$1[[:space:]]+$2[[:space:]]+$IP/32" "$HBA" || printf 'host %s %s %s/32 scram-sha-256  # allow-db-ip %s\n' "$1" "$2" "$IP" "$IP" >> "$HBA"; }
add hdchop hdchop_app
add stinkin_catalog hdchop_ro
ERR=$(sudo -u postgres psql -Atc "SELECT count(*) FROM pg_hba_file_rules WHERE error IS NOT NULL")
if [ "$ERR" != "0" ]; then
  cp "$BAK" "$HBA"
  echo "pg_hba has $ERR rule errors -> restored $BAK, not reloaded" >&2
  exit 1
fi
sudo -u postgres psql -Atc "SELECT pg_reload_conf()" >/dev/null
echo "Reloaded. Backup: $BAK"
grep -n "$IP" "$HBA"
REMOTE
