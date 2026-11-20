#!/usr/bin/env bash
cd "$(dirname "$0")/../.."; now=$(date +%s)
for s in mk mkst mkrv; do
  o=$(stat -c %Y outbox/$s.md 2>/dev/null || stat -f %m outbox/$s.md)
  i=$(git log -1 --format=%ct -- inbox/$s.md 2>/dev/null); i=${i:-0}
  m=$(( (now-o)/60 ))
  if [ "$o" -gt "$i" ] && [ "$m" -gt 60 ]; then echo "$s STALE ${m}min"; else echo "$s OK"; fi
done
