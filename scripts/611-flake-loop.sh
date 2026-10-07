#!/usr/bin/env bash
# scripts/611-flake-loop.sh — يُشغّل اختبار build-timeline.test.ts «disables MP4 …»
# N مرّة ويطبع ملخّصاً (pass/fail + مواضع التوقّف إن سقط).
#
# **لماذا منفصل عن `pnpm test`:** للـflake-measurement نحتاج تكراراً داخل
# نفس بيئة الحاوية (ci-studio.sh يبقي Studio على 19081 لكلّ التكرار)
# دون إعادة بناء كلّ مرّة.
#
# **الاستخدام (داخل حاوية mk-ci):**
#   bash infra/ci-studio.sh bash scripts/611-flake-loop.sh [N=20]
#
# **المخرج:** لوغ لكلّ تكرار + ملخّص «p/f: X · في: <السطر>»، exit≠0 إن سقط ولو واحد.

set -u

N="${1:-20}"
TEST_FILE='apps/studio/app/(app)/reels/build-timeline.test.ts'
TEST_NAME='disables MP4 export without a project or clips and submits the edited timeline'
LOG_DIR="/tmp/611-flake"
mkdir -p "$LOG_DIR"

PASS=0
FAIL=0
FAIL_LINES=()

for i in $(seq 1 "$N"); do
  LOG="$LOG_DIR/run-$i.log"
  echo "══════════ run $i/$N ══════════"
  if pnpm vitest run "$TEST_FILE" -t "$TEST_NAME" > "$LOG" 2>&1; then
    PASS=$((PASS+1))
    echo "  ✓ pass"
  else
    FAIL=$((FAIL+1))
    # استخرج موضع التوقّف من الـlog (أوّل TimeoutError أو AssertionError + السطر إن وُجد).
    WHERE=$(grep -m1 -E 'TimeoutError|AssertionError|Error:' "$LOG" | head -1 | tr -d '\r' | cut -c1-200)
    AT=$(grep -m1 -E 'build-timeline\.test\.ts:[0-9]+' "$LOG" | head -1 | sed 's/.*\(build-timeline\.test\.ts:[0-9]*\).*/\1/' || echo '?')
    FAIL_LINES+=("run $i → $AT · $WHERE")
    echo "  ✗ fail at $AT · $WHERE"
  fi
done

echo ""
echo "══════════ 611 flake-loop summary ══════════"
echo "pass: $PASS / $N"
echo "fail: $FAIL / $N"
if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "sites of failure:"
  for L in "${FAIL_LINES[@]}"; do echo "  $L"; done
  exit 1
fi
exit 0
