#!/bin/bash
# KB-Web 全功能自动化测试
# 用法: bash http_test.sh [base_url]

BASE="${1:-http://127.0.0.1:3344}"
PASS=0
FAIL=0
COOKIE_FILE=$(mktemp)
REPORT_FILE="/tmp/kb-web-test-$(date +%Y%m%d-%H%M%S).log"

echo "╔══════════════════════════════════════╗"
echo "║   KB-Web 全功能自动化测试           ║"
echo "║   $(date '+%Y-%m-%d %H:%M:%S')            ║"
echo "╚══════════════════════════════════════╝"
echo ""

check() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  ✅ $name"
        PASS=$((PASS + 1))
        echo "[PASS] $name" >> "$REPORT_FILE"
    else
        echo "  ❌ $name (期望: $expected, 实际: $actual)"
        FAIL=$((FAIL + 1))
        echo "[FAIL] $name (期望: $expected, 实际: $actual)" >> "$REPORT_FILE"
    fi
}

check_code() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [ "$actual" = "$expected" ]; then
        echo "  ✅ $name"
        PASS=$((PASS + 1))
    else
        echo "  ❌ $name (HTTP $actual, 期望 $expected)"
        echo "     响应体: $(cat /tmp/_resp_body 2>/dev/null | head -c 200)"
        FAIL=$((FAIL + 1))
    fi
}

# === 1. 首页 ===
echo "━━━ 1. 首页访问 ━━━"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -m 5 "$BASE/")
check_code "首页返回 200" "200" "$CODE"

CONTENT_TYPE=$(curl -s -o /dev/null -w "%{content_type}" -m 5 "$BASE/")
echo "   Content-Type: $CONTENT_TYPE"

# === 2. 登录 ===
echo ""
echo "━━━ 2. 认证 ━━━"
curl -s -c "$COOKIE_FILE" -m 5 "$BASE/api/auth/login" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' > /tmp/_resp_body 2>&1
CODE=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_FILE" -m 5 "$BASE/api/auth/login" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}')
check_code "登录(admin/admin123)" "200" "$CODE"

# 错误密码
CODE=$(curl -s -o /dev/null -w "%{http_code}" -c "$COOKIE_FILE" -m 5 "$BASE/api/auth/login" -X POST \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"wrongpass"}')
check_code "登录(错误密码→401)" "401" "$CODE"

# 登录状态
curl -s -b "$COOKIE_FILE" -m 5 "$BASE/api/auth/me" > /tmp/_resp_body
CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_FILE" -m 5 "$BASE/api/auth/me")
check_code "登录状态(/me)" "200" "$CODE"

# === 3. 文件列表 ===
echo ""
echo "━━━ 3. 文件管理 ━━━"
curl -s -b "$COOKIE_FILE" -m 5 "$BASE/api/files" > /tmp/_files.json
FILE_COUNT=$(python3 -c "import json; print(len(json.load(open('/tmp/_files.json'))))" 2>/dev/null || echo "0")
check_code "文件列表(HTTP 200)" "200" "$(curl -s -o /dev/null -w '%{http_code}' -b "$COOKIE_FILE" -m 5 "$BASE/api/files")"
echo "   文件总数: $FILE_COUNT"

if [ "$FILE_COUNT" -gt 0 ]; then
    # 下载第一个文件
    FIRST_ID=$(python3 -c "import json; print(json.load(open('/tmp/_files.json'))[0]['id'])")
    CODE=$(curl -s -o /dev/null -w "%{http_code}" -b "$COOKIE_FILE" -m 10 "$BASE/api/files/download/$FIRST_ID")
    check_code "下载文件(id=$FIRST_ID)" "200" "$CODE"
fi

# === 4. 搜索 ===
echo ""
echo "━━━ 4. 语义搜索 ━━━"
# 中文搜索
curl -s -b "$COOKIE_FILE" -m 30 "$BASE/api/search?q=%E6%96%B9%E6%A1%88" > /tmp/_search1.json
SEARCH_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/_search1.json')); print(len(d))" 2>/dev/null || echo "err")
echo "   搜索'方案': $SEARCH_COUNT 条结果"
[ "$SEARCH_COUNT" = "err" ] && FAIL=$((FAIL+1)) || PASS=$((PASS+1))

# 英文搜索
curl -s -b "$COOKIE_FILE" -m 30 "$BASE/api/search?q=SM2" > /tmp/_search2.json
SEARCH_SM2=$(python3 -c "import json; d=json.load(open('/tmp/_search2.json')); print(len(d))" 2>/dev/null || echo "err")
echo "   搜索'SM2': $SEARCH_SM2 条结果"
[ "$SEARCH_SM2" = "err" ] && FAIL=$((FAIL+1)) || PASS=$((PASS+1))

# 空搜索
curl -s -b "$COOKIE_FILE" -m 10 "$BASE/api/search?q=" > /tmp/_search3.json
EMPTY_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/_search3.json')); print(len(d))" 2>/dev/null || echo "err")
echo "   空搜索: $EMPTY_COUNT 条(最近文件)"
[ "$EMPTY_COUNT" = "err" ] && FAIL=$((FAIL+1)) || PASS=$((PASS+1))

# 不存在关键词
curl -s -b "$COOKIE_FILE" -m 30 "$BASE/api/search?q=zzzzznotexist" > /tmp/_search4.json
ZERO_COUNT=$(python3 -c "import json; d=json.load(open('/tmp/_search4.json')); print(len(d))" 2>/dev/null || echo "err")
echo "   搜索'zzzzznotexist': $ZERO_COUNT 条(应为0)"
[ "$ZERO_COUNT" = "err" ] && FAIL=$((FAIL+1)) || PASS=$((PASS+1))

# === 5. 方法标注 ===
echo ""
echo "━━━ 5. 搜索结果质量 ━━━"
python3 << 'PYEOF' 2>/dev/null
import json
with open('/tmp/_search1.json') as f:
    d = json.load(f)
if d:
    first = d[0]
    has_method = '_method' in first
    has_score = first.get('_score') is not None
    has_snippet = bool(first.get('snippet'))
    has_dl = 'download_url' in first
    print(f"   _method: {'✅' if has_method else '❌'}")
    print(f"   _score: {'✅' if has_score else '❌'}")
    print(f"   snippet: {'✅' if has_snippet else '❌'}")
    print(f"   download_url: {'✅' if has_dl else '❌'}")
    if has_method:
        print(f"   方法: {first['_method']}")
    if has_snippet:
        snip = (first["snippet"] or "")[:60]
        print(f"   片段预览: {snip}")
else:
    print("   无搜索结果")
PYEOF

echo ""
echo "━━━ 测试结果 ━━━"
echo "   ✅ 通过: $PASS"
echo "   ❌ 失败: $FAIL"
echo "   📄 报告: $REPORT_FILE"
echo ""

rm -f "$COOKIE_FILE" /tmp/_resp_body /tmp/_files.json /tmp/_search1.json /tmp/_search2.json /tmp/_search3.json /tmp/_search4.json
