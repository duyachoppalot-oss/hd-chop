#!/usr/bin/env bash
# Deploy apps/api to the Hetzner server as a Docker container.
#   - copies apps/api to ~/hd-chop/api on the server
#   - builds image hd-chop-api:<git sha> there
#   - replaces container hd-chop-api: host network, listens on 127.0.0.1:3001,
#     restarts with Docker, env from ~/hd-chop/api.env (APP_DATABASE_URL for
#     hdchop_api at 127.0.0.1, no sslmode; chmod 600; written by hand on the server)
#     and HDCHOP_APP_KEYS (comma list of app keys; apps/api/middleware.ts)
#   - health-checks /v1/years (with the first app key) and rolls back to the previous image if it fails
# nginx (hdchop.5.161.100.126.nip.io -> 127.0.0.1:3001) is configured separately.
# Usage: scripts/deploy/api.sh
set -euo pipefail
HOST=deploy@5.161.100.126
cd "$(git rev-parse --show-toplevel)"
SHA=$(git rev-parse --short HEAD)
if ! git diff --quiet HEAD -- apps/api; then SHA="$SHA-dirty"; fi

rsync -az --delete --exclude node_modules --exclude .next --exclude '*.tsbuildinfo' apps/api/ "$HOST:hd-chop/api/"

ssh "$HOST" SHA="$SHA" bash -s <<'REMOTE'
set -euo pipefail
cd ~/hd-chop
test -f api.env || { echo "missing ~/hd-chop/api.env"; exit 1; }
[ "$(stat -c %a api.env)" = 600 ] || { echo "~/hd-chop/api.env must be chmod 600"; exit 1; }
KEY=$(sed -n 's/^HDCHOP_APP_KEYS=//p' api.env | cut -d, -f1)
[ -n "$KEY" ] || { echo "~/hd-chop/api.env has no HDCHOP_APP_KEYS (docs/FIX_PLAN.md A3)"; exit 1; }
docker build -q -t "hd-chop-api:$SHA" api
PREV=$(docker inspect -f '{{.Config.Image}}' hd-chop-api 2>/dev/null || true)
docker rm -f hd-chop-api >/dev/null 2>&1 || true
run() { docker run -d --name hd-chop-api --restart unless-stopped --network host --memory 512m --env-file api.env "$1" >/dev/null; }
run "hd-chop-api:$SHA"
for i in $(seq 1 20); do
  if curl -fsS -H "X-App-Key: $KEY" http://127.0.0.1:3001/v1/years >/dev/null 2>&1; then echo "hd-chop-api:$SHA healthy"; exit 0; fi
  sleep 1
done
echo "health check failed; logs:"; docker logs --tail 30 hd-chop-api
if [ -n "$PREV" ]; then
  docker rm -f hd-chop-api >/dev/null; run "$PREV"; echo "rolled back to $PREV"
fi
exit 1
REMOTE
