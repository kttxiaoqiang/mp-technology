#!/bin/bash
# kb-web 全功能测试脚本
# 用法: bash /tmp/test_all.sh [BASE_URL] [USER] [PASS]

BASE_URL="${1:-http://localhost:3344}"
USER="${2:-admin}"
PASS="${3:-admin123}"
COOKIE_FILE=$(mktemp)
PASS=0
FAIL=0
SKIP=0

red()   { echo -e "\e[31m✗ $1\e[0m"; }
green() { echo -e "\e[32m✓ $1\e[0m"; }
blue()  { echo -e "\e[34m▶ $1\e[0m"; }
yellow(){ echo -e "\e[33m⚠ $1\e[0m"; }

assert_http() {
    local desc="$1" method="$2" url="$3" expected="$4"
    local extra=""
    [ -n "$5" ] && extra="$5"
    local curl_cmd="curl -s -o /tmp/_test_body.txt -w '%{http_code}' -b ${COOKIE_FILE} -c ${COOKIE_FILE} -X ${method}"
    [ -n "$5" ] && curl_cmd="${curl_cmd} ${extra}"
    
    local code=$(eval "${curl_cmd} \"${BASE_URL}${url}\" 2>/dev/null")
    if [ "$code" = "$expected" ]; then
        green "${desc} → ${code}"
        PASS=$((PASS+1))
    else
        red "${desc} → 期望 ${expected}，实际 ${code}" 
        echo "  响应内容: $(cat /tmp/_test_body.txt | head -5)"
        FAIL=$((FAIL+1))
    fi
}

assert_body() {
    local desc="$1" method="$2" url="$3" expect_text="$4" expected_code="$5"
    local extra="$6"
    local curl_cmd="curl -s -o /tmp/_test_body.txt -w '%{http_code}' -b ${COOKIE_FILE} -c ${COOKIE_FILE} -X ${method}"
    [ -n "$6" ] && curl_cmd="${curl_cmd} ${extra}"
    
    local code=$(eval "${curl_cmd} \"${BASE_URL}${url}\" 2>/dev/null")
    local body=$(cat /tmp/_test_body.txt)
    
    if [ "$code" != "$expected_code" ]; then
        red "${desc} → 期望 ${expected_code}，实际 ${code}"
        echo "  响应: ${body:0:100}"
        FAIL=$((FAIL+1))
        return
    fi
    if echo "$body" | grep -q "$expect_text"; then
        green "${desc} → ${code} (包含\"${expect_text}\")"
        PASS=$((PASS+1))
    else
        red "${desc} → ${code}，但响应不包含\"${expect_text}\""
        echo "  响应: ${body:0:200}"
        FAIL=$((FAIL+1))
    fi
}

# ─────────────────────────────────────────
blue "============================================"
blue " kb-web 全功能测试套件"
blue " 地址: ${BASE_URL}"
blue "============================================"

# ─── 1. 未登录访问控制 ─────────────────────────  
blue "── 1. 未登录访问控制 ──"
assert_http  "首页(未登录)重定向"  GET  "/"  "302"
assert_http  "登录页可访问"       GET  "/login"  "200"
assert_body  "登录页含登录表单"   GET  "/login"  "login"  "200"
assert_http  "API/files需登录"     GET  "/api/files"  "302"
assert_http  "API/faq需登录"       GET  "/api/faq"  "302"
assert_http  "API/search需登录"    GET  "/api/search"  "302"
assert_http  "API/me需登录"        GET  "/api/auth/me"  "302"

# ─── 2. 静态资源 ───────────────────────────────
blue "── 2. 静态资源 ──"
assert_http  "CSS文件(bootstrap)"   GET  "/css/bootstrap.min.css"  "200"
assert_http  "JS文件"               GET  "/js/bootstrap.bundle.min.js"  "200"
# 确认首页不会被静态中间件拦截（需要验证302而非200）
assert_http  "首页(/)不直接返回静态"  GET  "/"  "302"

# ─── 3. 登录功能 ───────────────────────────────
blue "── 3. 登录功能 ──"
# 有效登录
assert_body  "有效登录 → 200"   POST  "/api/auth/login"  "登录成功"  "200"  "-H 'Content-Type: application/json' -d '{\"username\":\"${USER}\",\"password\":\"${PASS}\"}'"
# 无效凭据
assert_body  "无效凭据 → 401"   POST  "/api/auth/login"  "失败"  "401"  "-H 'Content-Type: application/json' -d '{\"username\":\"${USER}\",\"password\":\"wrong\"}'"

# ─── 4. 已登录访问 ─────────────────────────────
blue "── 4. 已登录后访问 ──"
# 先登录保持会话
curl -s -c ${COOKIE_FILE} -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\"}" >/dev/null

assert_http  "首页(已登录)"     GET  "/"  "200"
assert_body  "/me返回用户信息"   GET  "/api/auth/me"  "id"  "200"
assert_body  "/me包含admin"      GET  "/api/auth/me"  "admin"  "200"
assert_http  "文件列表(已登录)"  GET  "/api/files"  "200"
assert_http  "FAQ列表(已登录)"   GET  "/api/faq"  "200"
assert_http  "搜索(已登录)"     GET  "/api/search?q=密码"  "200"

# ─── 5. 文件管理 ───────────────────────────────
blue "── 5. 文件管理 ──"
# 测试上传一个文件
rm -f /tmp/_test_upload.txt
echo "测试文档内容 密码安全 方案" > /tmp/_test_upload.txt

# admin上传（当前是admin会话）
assert_body "上传文件" POST "/api/upload" "成功" "200" "-F 'file=@/tmp/_test_upload.txt'"

# 获取文件ID用于删除测试
FILE_ID=$(curl -s -b ${COOKIE_FILE} "${BASE_URL}/api/files" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('files',d.get('data',[]))[0]['id'] if d.get('files',d.get('data',[])) else 'none')" 2>/dev/null)
echo "  文件ID: ${FILE_ID}"

assert_http "文件列表(上传后)" GET "/api/files" "200"
assert_body "文件列表含测试文件" GET "/api/files" "_test_upload" "200"

# 搜索测试
assert_body "搜索'密码'" GET "/api/search?q=密码" "结果" "200"
assert_http "搜索空参数" GET "/api/search" "200"

# 删除文件（admin操作）
if [ "$FILE_ID" != "none" ] && [ -n "$FILE_ID" ]; then
    assert_http "删除文件" DELETE "/api/files/${FILE_ID}" "200"
fi

# ─── 6. FAQ管理 ────────────────────────────────
blue "── 6. FAQ管理 ──"
# 创建FAQ
assert_body "创建FAQ" POST "/api/faq" "成功" "200" "-H 'Content-Type: application/json' -d '{\"question\":\"测试问题\",\"answer\":\"测试答案\"}'"

# 获取FAQ ID
FAQ_ID=$(curl -s -b ${COOKIE_FILE} "${BASE_URL}/api/faq" | python3 -c "import sys,json; d=json.load(sys.stdin); faq=d.get('faq',d.get('data',[])); print(faq[0]['id'] if faq else 'none')" 2>/dev/null)
echo "  FAQ ID: ${FAQ_ID}"

if [ "$FAQ_ID" != "none" ] && [ -n "$FAQ_ID" ]; then
    assert_body "修改FAQ" PUT "/api/faq/${FAQ_ID}" "成功" "200" "-H 'Content-Type: application/json' -d '{\"question\":\"更新问题\",\"answer\":\"更新答案\"}'"
    assert_http "删除FAQ" DELETE "/api/faq/${FAQ_ID}" "200"
fi

# ─── 7. 管理员功能 ─────────────────────────────
blue "── 7. 管理功能 ──"
assert_body "用户列表(admin)" GET "/api/admin/users" "username" "200"
assert_http "操作日志(admin)" GET "/api/admin/logs" "200"

# ─── 8. 登出 ───────────────────────────────────
blue "── 8. 登出功能 ──"
assert_http "登出" POST "/api/auth/logout" "200"
assert_http "登出后首页需重新登录" GET "/" "302"

# ─── 9. 知识库静态文件 ─────────────────────────
blue "── 9. 知识库静态文件 ──"
# 重新登录
curl -s -c ${COOKIE_FILE} -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER}\",\"password\":\"${PASS}\"}" >/dev/null

# 检查 kb_data 静态目录（受 isAuthenticated 保护）
assert_http "知识库静态(kb_data)" GET "/kb_data" "200"

# ─── 10. 404 路由 ──────────────────────────────
blue "── 10. 错误路由 ──"
assert_http "不存在的路由" GET "/nonexistent" "404"

# ─────────────────────────────────────────
blue "============================================"
TOTAL=$((PASS+FAIL+SKIP))
blue " 测试完成: ${TOTAL} 总用例  ✓ ${PASS} 通过  ✗ ${FAIL} 失败  ⚠ ${SKIP} 跳过"
blue "============================================"

rm -f ${COOKIE_FILE} /tmp/_test_body.txt /tmp/_test_upload.txt
exit $FAIL
