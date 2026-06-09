#!/bin/bash
cd /home/zhang/kb-web
fuser -k 3344/tcp 2>/dev/null
setsid node server.js > /tmp/kb-web.log 2>&1 &
PID=$!
echo $PID > /tmp/kb-web.pid
echo "KB Web started, PID: $PID"
