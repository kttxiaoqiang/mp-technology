#!/bin/bash
# 启动密评抓包分析工具
cd "$(dirname "$0")"
fuser -k 3346/tcp 2>/dev/null
sleep 1
nohup python3 pcap_analyzer.py 3346 > /tmp/pcap_analyzer.log 2>&1 &
sleep 2
echo "✅ 密评抓包分析工具已启动: http://localhost:3346/"
echo "   查看日志: tail -f /tmp/pcap_analyzer.log"
