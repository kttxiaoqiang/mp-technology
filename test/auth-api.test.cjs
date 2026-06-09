/**
 * 认证路由集成测试（Express API）
 * 需要先创建测试数据库 + 启动临时 Express
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── 准备测试环境 ──────────────────────────────
const dbDir = path.join(os.tmpdir(), `kb-test-auth-api-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;
process.env.KB_ADMIN_USER = 'apitest';
process.env.KB_ADMIN_PASS = 'apipass123';
process.env.SESSION_SECRET = 'test-secret-for-testing';
process.env.KB_DIR = dbDir; // 上传目录

// 初始化数据库 + 管理员
delete require.cache[require.resolve('../lib/database.cjs')];
const { initTables } = require('../lib/database.cjs');
initTables();

// 启动 Express server
delete require.cache[require.resolve('../server_v2.cjs')];
const app = require('../server_v2.cjs');
let server;
const PORT = 19876;

function fetch(method, urlPath, body, cookie) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookie) opts.headers.Cookie = cookie;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          status: res.statusCode,
          body: json,
          headers: res.headers,
          raw: data
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

before(() => {
  return new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });
});

after(() => {
  return new Promise((resolve) => {
    server.close(() => {
      const { closeDb } = require('../lib/database.cjs');
      closeDb();
      fs.rmSync(dbDir, { recursive: true, force: true });
      delete process.env.KB_DATA_DIR;
      delete process.env.KB_ADMIN_USER;
      delete process.env.KB_ADMIN_PASS;
      delete process.env.SESSION_SECRET;
      delete process.env.KB_DIR;
      resolve();
    });
  });
});

// ─── 测试 ──────────────────────────────────────
it('GET /api/auth/me 未登录时返回 user: null', async () => {
  const res = await fetch('GET', '/api/auth/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { user: null });
});

it('POST /api/auth/login 空参数返回 400', async () => {
  const res = await fetch('POST', '/api/auth/login', {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error, '用户名和密码不能为空');
});

it('POST /api/auth/login 错误密码返回 401', async () => {
  const res = await fetch('POST', '/api/auth/login', { username: 'apitest', password: 'wrongpass' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, '用户名或密码错误');
});

it('POST /api/auth/login 正确凭据返回用户信息并设置 cookie', async () => {
  const res = await fetch('POST', '/api/auth/login', { username: 'apitest', password: 'apipass123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.username, 'apitest');
  assert.equal(res.body.role, 'admin');
  assert.ok(res.body.id > 0);
  // 应有 set-cookie
  const setCookie = res.headers['set-cookie'];
  assert.ok(setCookie, '应设置 session cookie');
});

it('GET /api/auth/me 登录后返回当前用户', async () => {
  // 先登录获取 cookie
  const loginRes = await fetch('POST', '/api/auth/login', { username: 'apitest', password: 'apipass123' });
  const cookie = loginRes.headers['set-cookie'];

  const res = await fetch('GET', '/api/auth/me', null, cookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, 'apitest');
  assert.equal(res.body.user.role, 'admin');
});

it('POST /api/auth/logout 销毁 session', async () => {
  const loginRes = await fetch('POST', '/api/auth/login', { username: 'apitest', password: 'apipass123' });
  const cookie = loginRes.headers['set-cookie'];

  // 先确认登录状态
  const me1 = await fetch('GET', '/api/auth/me', null, cookie);
  assert.ok(me1.body.user, '登录后应能获取用户');

  // 登出
  const logoutRes = await fetch('POST', '/api/auth/logout', null, cookie);
  assert.equal(logoutRes.status, 200);
  assert.deepEqual(logoutRes.body, { ok: true });

  // 再用同一 cookie 查询应返回 null
  const me2 = await fetch('GET', '/api/auth/me', null, cookie);
  assert.deepEqual(me2.body, { user: null }, '登出后 session 应失效');
});
