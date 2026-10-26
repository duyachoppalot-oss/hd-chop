#!/usr/bin/env bash
# Apply the /v1/ rate limit (scripts/deploy/nginx-hdchop.conf, docs/FIX_PLAN.md A2) on the server.
#   - backs up /etc/nginx/sites-available/hd-chop-api to ~/hd-chop/nginx-hd-chop-api.bak.<ts>
#   - writes /etc/nginx/conf.d/hdchop-ratelimit.conf (30r/m per IP, 429)
#   - adds `location /v1/` (limit_req burst=20 nodelay + the same proxy lines) above `location /`
#   - nginx -t; reload only if it passes, else restores the backup and empties the conf.d file
# Needs deploy's NOPASSWD sudo for nginx, systemctl reload nginx, tee <conf.d file>, cp.
# Usage (from the Mac): scripts/deploy/apply-ratelimit.sh
set -euo pipefail
ssh deploy@5.161.100.126 bash -s <<'REMOTE'
set -euo pipefail
cd ~/hd-chop
SITE=/etc/nginx/sites-available/hd-chop-api
BAK=nginx-hd-chop-api.bak.$(date +%Y%m%d_%H%M%S)
cp "$SITE" "$BAK"
python3 - "$SITE" > nginx-hd-chop-api.new <<'PY'
import sys
s = open(sys.argv[1]).read()
block = """    location /v1/ {
        limit_req zone=hdchop_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / {"""
assert s.count("    location / {") == 1, "expected one `location /` block"
assert "limit_req" not in s, "rate limit already in the site config"
sys.stdout.write(s.replace("    location / {", block, 1))
PY
diff "$BAK" nginx-hd-chop-api.new || true
printf 'limit_req_zone $binary_remote_addr zone=hdchop_api:10m rate=30r/m;\nlimit_req_status 429;\nlimit_req_log_level warn;\n' \
  | sudo -n /usr/bin/tee /etc/nginx/conf.d/hdchop-ratelimit.conf >/dev/null
sudo -n /usr/bin/cp nginx-hd-chop-api.new "$SITE"
if sudo -n /usr/sbin/nginx -t; then
  sudo -n /bin/systemctl reload nginx && echo "RELOADED (backup: ~/hd-chop/$BAK)"
else
  echo "nginx -t FAILED, restoring $BAK"
  sudo -n /usr/bin/cp "$BAK" "$SITE"
  : | sudo -n /usr/bin/tee /etc/nginx/conf.d/hdchop-ratelimit.conf >/dev/null
  sudo -n /usr/sbin/nginx -t
  exit 1
fi
REMOTE
