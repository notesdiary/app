#!/usr/bin/env bash
set -euo pipefail

PORT=5173

cd "$(dirname "${BASH_SOURCE[0]}")"

pid="$(lsof -ti "tcp:${PORT}" || true)"
if [ -n "$pid" ]; then
  echo "Port ${PORT} in use by PID ${pid}, killing it..."
  kill -9 $pid || true
fi

npm run build
npm run preview -- --port "${PORT}"
