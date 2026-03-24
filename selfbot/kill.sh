#!/bin/bash
PIDS=$(pgrep -f 'node index.mjs')

if [ -z "$PIDS" ]; then
  echo "none running"
  exit 0
fi

echo "killing pids: $PIDS"
kill $PIDS
sleep 1

STILL=$(pgrep -f 'node index.mjs')
if [ -n "$STILL" ]; then
  echo "force killing: $STILL"
  kill -9 $STILL
fi

echo "all stopped"
