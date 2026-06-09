#!/bin/bash
# KB-Web 一键安装脚本（国内镜像源）

set -e

echo "╔═══════════════════════════════════════════╗"
echo "║    KB-Web 知识库系统 — 环境安装脚本       ║"
echo "║          国内镜像源加速                    ║"
echo "╚═══════════════════════════════════════════╝"

# ─── 配置 ──────────────────────────────────
KB_DIR="/home/zhang/kb-web"
PYTHON_VENV="/home/zhang/桌面/openclaw-env"
PIP_MIRROR="https://pypi.tuna.tsinghua.edu.cn/simple"
NPM_MIRROR="https://registry.npmmirror.com"

cd "$KB_DIR"

echo ""
echo "═══ 1/4: 配置 npm 国内源 ═══"
npm config set registry "$NPM_MIRROR"
echo "npm registry → $(npm config get registry)"

echo ""
echo "═══ 2/4: 安装 Node.js 依赖 ═══"
npm install better-sqlite3 express multer express-session 2>&1 | tail -5
npm install @tobilu/qmd 2>&1 | tail -5
echo "Node.js 依赖安装完成 ✓"

echo ""
echo "═══ 3/4: 配置 Python 国内源 ═══"
PYTHON_BIN="$PYTHON_VENV/bin/python3"
PIP_BIN="$PYTHON_VENV/bin/pip3"

# 配置 pip 国内源
mkdir -p ~/.pip
cat > ~/.pip/pip.conf << EOF
[global]
index-url = $PIP_MIRROR
trusted-host = pypi.tuna.tsinghua.edu.cn

[install]
trusted-host = pypi.tuna.tsinghua.edu.cn
EOF
echo "pip 国内源配置完成 ✓ ($PIP_MIRROR)"

echo ""
echo "═══ 4/4: 安装 Python 依赖 ═══"
# 注意：PyPI 上的 markitdown 包（v0.0.1a1）是空壳
# 文档转换依靠 LibreOffice 处理二进制文档（docx/pdf/xlsx/pptx）
# 不需要 Python markitdown 包
# 文本文件（txt/md/json/csv/xml/yaml）由 server 自己处理
echo "Python 依赖（LibreOffice 已系统预装）✓"
echo "文档转换: 文本→直接读取, 二进制→LibreOffice"

echo ""
echo "═══ 验证 ═══"
echo "Node.js: $(node --version)"
echo "Python: $("$PYTHON_BIN" --version)"
echo "npm: $(npm --version)"
echo "qmd: $(/usr/local/bin/qmd --version 2>&1 || echo '请手动安装 qmd')"
echo "LibreOffice: $(libreoffice --version 2>&1 | head -1)"
echo "better-sqlite3: $(node -e "require('better-sqlite3'); console.log('OK')" 2>&1)"

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║  安装完成！                                ║"
echo "║  启动: node server_v2.cjs                 ║"
echo "║  端口: 3344                               ║"
echo "╚═══════════════════════════════════════════╝"
