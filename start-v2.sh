#!/bin/bash
# kb-web v2 启动脚本
# 用法: ./start-v2.sh [--reset]

PORT=${KB_PORT:-3344}
SESSION_SECRET=${KB_SESSION_SECRET:-"kb-web-secret-change-me"}

# 服务器路径
SERVER="$(dirname "$0")/server_v2.cjs"

# 停止旧实例
fuser -k "${PORT}/tcp" 2>/dev/null
sleep 1

# --reset 参数清空数据库
if [ "$1" = "--reset" ]; then
  echo "[start] 重置数据库..."
  rm -rf "$(dirname "$0")/kb_data"
fi

# 如果未设置管理员账号，提示
if [ -z "$KB_ADMIN_USER" ] || [ -z "$KB_ADMIN_PASS" ]; then
  if [ ! -d "$(dirname "$0")/kb_data" ]; then
    echo "[start] ⚠️  首次启动请设置环境变量:"
    echo "  KB_ADMIN_USER=admin KB_ADMIN_PASS=your_password $0"
    echo "[start] 使用默认账号 admin / admin123 启动..."
    export KB_ADMIN_USER=admin
    export KB_ADMIN_PASS=admin123
  fi
fi

export SESSION_SECRET

nohup node "$SERVER" > /tmp/kb-web-v2.log 2>&1 &
PID=$!
sleep 2

if kill -0 $PID 2>/dev/null; then
  echo "[start] ✅ kb-web v2 已启动 (PID: $PID)"
  echo "[start]    http://localhost:${PORT}"
else
  echo "[start] ❌ 启动失败，查看日志:"
  tail -5 /tmp/kb-web-v2.log
fi
