#!/usr/bin/env bash
s="$1"; cd "$(dirname "$0")/../.."
for n in 1 2 3; do
  git add inbox outbox
  git diff --cached --quiet || git commit -q -m "ops($s): $(date -u +%Y-%m-%dT%H:%MZ)"
  git pull -q --rebase --autostash && git push -q && { git log -1 --format=%h; exit 0; }
  sleep 5
done
echo "STOP sync failed after 3 tries"; exit 1
