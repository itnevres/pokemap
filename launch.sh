#!/usr/bin/env bash
# Launches PokeMap: API server + UI dev server, opens the browser, cleans
# up both on exit (Ctrl+C included).

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

API_PORT=5174
UI_PORT=5173
API_PID=""
UI_PID=""

cleanup() {
  echo ""
  echo "Stopping PokeMap..."
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -n "$UI_PID" ] && kill "$UI_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

wait_for() {
  # wait_for <url> <max_tries>
  local url="$1" tries="$2" i=0
  while [ "$i" -lt "$tries" ]; do
    curl -sf "$url" >/dev/null 2>&1 && return 0
    sleep 0.5
    i=$((i + 1))
  done
  return 1
}

if curl -sf "http://127.0.0.1:${API_PORT}/api/groups" >/dev/null 2>&1; then
  echo "API already running on :${API_PORT} -- reusing it."
else
  echo "Starting API on :${API_PORT}..."
  npx tsx packages/server/src/serve.ts &
  API_PID=$!
  if ! wait_for "http://127.0.0.1:${API_PORT}/api/groups" 30; then
    echo "API didn't come up in time -- check the output above." >&2
    exit 1
  fi
fi

echo "Starting UI on :${UI_PORT}..."
npm run dev --workspace=@pokemap/ui &
UI_PID=$!

if wait_for "http://127.0.0.1:${UI_PORT}" 60; then
  echo ""
  echo "PokeMap running: http://localhost:${UI_PORT}"
  cmd.exe /c start "" "http://localhost:${UI_PORT}" 2>/dev/null
else
  echo "UI didn't come up in time -- check the output above." >&2
fi

echo "Press Ctrl+C to stop both servers."
wait
