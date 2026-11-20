#!/usr/bin/env bash
# Single-instance Hatch Telegram worker.
# Slow restart so a dying getUpdates long-poll does not Conflict with the next one.
# Do not also run LaunchAgent + this script + `npm run telegram` at the same time.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PIDFILE="${HATCH_TELEGRAM_PIDFILE:-$ROOT/data/telegram.pid}"
RESTART_DELAY="${HATCH_TELEGRAM_RESTART_DELAY:-8}"

mkdir -p "$(dirname "$PIDFILE")"

if [[ -f "$PIDFILE" ]]; then
  old="$(tr -d '[:space:]' < "$PIDFILE" || true)"
  if [[ -n "${old:-}" ]] && kill -0 "$old" 2>/dev/null; then
    echo "Stopping existing telegram bridge pid $old"
    kill "$old" 2>/dev/null || true
    sleep "$RESTART_DELAY"
    if kill -0 "$old" 2>/dev/null; then
      kill -9 "$old" 2>/dev/null || true
      sleep 2
    fi
  fi
  rm -f "$PIDFILE"
fi

exec npm run telegram
