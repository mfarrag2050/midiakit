#!/usr/bin/env bash
# Own Studio for the browser test inside the disposable CI container only.
set -euo pipefail

# Serve a built Studio without a development watcher during the test suite.
"${CHROME_PATH}" --version
NEXT_PUBLIC_API_URL=http://127.0.0.1:19080 \
  NEXT_PUBLIC_API_MOCK=false NEXT_TELEMETRY_DISABLED=1 \
  pnpm --filter @pf-mediakit/studio build

(
  cd apps/studio
  # Browser tests intercept /v1 HTTP; keep the real client path enabled.
  export NEXT_PUBLIC_API_URL=http://127.0.0.1:19080
  export NEXT_PUBLIC_API_MOCK=false NEXT_TELEMETRY_DISABLED=1
  exec node node_modules/next/dist/bin/next \
    start --hostname 127.0.0.1 --port 19081
) > /tmp/pf-mediakit-ci-studio.log 2>&1 &
studio_pid=$!
cleanup_studio() {
  local result=$?
  kill "$studio_pid" 2>/dev/null || true
  wait "$studio_pid" 2>/dev/null || true
  if [[ "$result" -ne 0 ]]; then
    cat /tmp/pf-mediakit-ci-studio.log
  fi
  exit "$result"
}
trap cleanup_studio EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Warm the actual route before Vitest starts its unchanged browser timeout.
node --input-type=module -e '
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:19081/reels", {
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      if (response.ok) {
        console.log("[mk-ci] Studio ready: http://127.0.0.1:19081/reels");
        process.exit(0);
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("CI Studio did not serve /reels within 120 seconds");
'

"$@"
