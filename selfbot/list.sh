#!/bin/bash
PIDS=$(pgrep -f 'node index.mjs')

if [ -z "$PIDS" ]; then
  echo "none running"
  exit 0
fi

COUNT=$(echo "$PIDS" | wc -w)
echo "$COUNT instance(s) running:"
for PID in $PIDS; do
  echo "  pid $PID — started $(ps -p $PID -o lstart= 2>/dev/null || echo 'unknown')"
done
