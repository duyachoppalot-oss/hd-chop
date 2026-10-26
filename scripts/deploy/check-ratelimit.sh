#!/usr/bin/env bash
# Fire N quick requests at the public API and count status codes (docs/FIX_PLAN.md A2).
# Read-only (GET /v1/years). With the nginx limit applied: ~21 x 200, the rest 429.
# Usage: scripts/deploy/check-ratelimit.sh [N] [URL]
set -euo pipefail
N=${1:-50}
URL=${2:-https://hdchop.5.161.100.126.nip.io/v1/years}
for i in $(seq 1 "$N"); do
  curl -s -o /dev/null -w '%{http_code}\n' "$URL"
done | sort | uniq -c
