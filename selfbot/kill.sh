#!/bin/bash
pkill -f 'node index.mjs' && echo "all stopped" || echo "none running"
