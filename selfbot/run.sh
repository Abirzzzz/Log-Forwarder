#!/bin/bash
cd "$(dirname "$0")"

RUNNING=$(pgrep -f 'node index.mjs')
if [ -n "$RUNNING" ]; then
  echo "already running (pids: $RUNNING)"
  echo "run kill.sh first if you want to restart"
  exit 1
fi

node index.mjs &
PID=$!
echo "started (pid $PID)"
