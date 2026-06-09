#!/bin/bash
# 确保 kb-web 一直运行
PORT=3344
PID_FILE=/tmp/kb-web.pid
LOG=/tmp/kb-web.log
DIR=/home/zhang/kb-web

# 检查端口是否已被占用
if ss -tlnp | grep -q ":$PORT "; then
    echo "$(date) 端口 $PORT 已被占用，跳过" >> "$LOG"
    exit 0
fi

# 如果 PID 文件存在但进程不存在，清理
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if ! kill -0 "$OLD_PID" 2>/dev/null; then
        rm -f "$PID_FILE"
    fi
fi

# 启动服务
cd "$DIR"
nohup node server_v2.cjs >> "$LOG" 2>&1 &
echo $! > "$PID_FILE"
echo "$(date) 服务已启动，PID: $!" >> "$LOG"
