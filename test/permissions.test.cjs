/**
 * 搜索 API + 权限边界 集成测试
 *
 * Cycle 6: 搜索
 *   1. 搜索存在的关键词返回结果
 *   2. 搜索不存在的关键词返回空
 *   3. 搜索空字符串返回空数组
 *
 * Cycle 7: 权限边界
 *   4. 未登录无法上传（401）
 *   5. 未登录无法查看文件列表（401）
 *   6. 未登录无法搜索（401）
 *   7. 工程师无法上传（403）
 *   8. 工程师无法删除文件（403）
 *   9. 工程师可以搜索（200）
 *  10. 工程师可以查看文件列表（200）
 *  11. 工程师可以查看 FAQ（200）
 *  12. 工程师无法创建 FAQ（403）
 *  13. 工程师无法查看操作日志（403）
 *  14. 工程师无法查看用户管理（403）
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const dbDir = path.join(os.tmpdir(), `kb-test-perm-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;
process.env.KB_ADMIN_USER = 'permadmin';
process.env.KB_ADMIN_PASS = 'permpass123';
process.env.SESSION_SECRET = 'test-secret-perm';
process.env.KB_DIR = dbDir;

delete require.cache[require.resolve('../lib/database.cjs')];
const { initTables } = require('../lib/database.cjs');
initTables();
// 手动创建工程师用户
const bcrypt = require('bcryptjs');
const { getDb } = require('../lib/database.cjs');
getDb().prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('engineer1', bcrypt.hashSync('engpass123', 10), 'engineer');

delete require.cache[require.resolve('../server_v2.cjs')];
const app = require('../server_v2.cjs');
const PORT = 19879;
let server;

function jsonReq(method, path, body, cookie) {
  return new Promise((resolve) => {
    const opts = {
      hostname: '127.0.0.1', port: PORT, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookie) opts.headers.Cookie = cookie;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: json, headers: res.headers });
      });
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function uploadReq(cookie) {
  return new Promise((resolve) => {
    const boundary = '----' + crypto.randomBytes(8).toString('hex');
    const fileContent = '测试搜索内容 GM-T-39786 标准规范';
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="search-test.txt"\r\nContent-Type: text/plain\r\n\r\n`),
      Buffer.from(fileContent),
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const opts = {
      hostname: '127.0.0.1', port: PORT, path: '/api/upload', method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    if (cookie) opts.headers.Cookie = cookie;
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.write(body);
    req.end();
  });
}

let adminCookie = '', engCookie = '';

before(async () => {
  await new Promise(r => server = app.listen(PORT, r));
  const adminRes = await jsonReq('POST', '/api/auth/login', { username: 'permadmin', password: 'permpass123' });
  adminCookie = adminRes.headers['set-cookie'];
  const engRes = await jsonReq('POST', '/api/auth/login', { username: 'engineer1', password: 'engpass123' });
  engCookie = engRes.headers['set-cookie'];
});

after(() => {
  return new Promise((resolve) => {
    server.close(() => {
      const { closeDb } = require('../lib/database.cjs');
      closeDb();
      fs.rmSync(dbDir, { recursive: true, force: true });
      delete process.env.KB_DATA_DIR; delete process.env.KB_ADMIN_USER;
      delete process.env.KB_ADMIN_PASS; delete process.env.SESSION_SECRET; delete process.env.KB_DIR;
      resolve();
    });
  });
});

// ─── Cycle 6: 搜索 ─────────────────────────────
it('搜索已上传文件内容返回结果', async () => {
  // 先上传一个包含特定文本的文件
  await uploadReq(adminCookie);

  const res = await jsonReq('GET', '/api/search?q=39786', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 1, '应找到匹配文件');
  assert.ok(res.body[0].original_name);
  assert.ok(res.body[0].snippet);
});

it('搜索不存在的关键词返回空数组', async () => {
  const res = await jsonReq('GET', '/api/search?q=__不存在的__', null, adminCookie);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

it('搜索空字符串返回空数组', async () => {
  const res = await jsonReq('GET', '/api/search?q=', null, adminCookie);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

it('搜索区分分类筛选', async () => {
  // 上传一个归为"方案"的文件
  const boundary = '----' + crypto.randomBytes(8).toString('hex');
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="设计方案.txt"\r\nContent-Type: text/plain\r\n\r\n`),
    Buffer.from('方案内容关键词'),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const opts = {
    hostname: '127.0.0.1', port: PORT, path: '/api/upload', method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length, Cookie: adminCookie }
  };
  await new Promise(r => { const req = http.request(opts, r); req.write(body); req.end(); });

  const res = await jsonReq('GET', '/api/search?q=关键词&category=方案', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
  assert.ok(res.body.every(r => r.category === '方案'));
});

// ─── Cycle 7: 权限边界 ─────────────────────────
it('未登录无法上传文件（401）', async () => {
  const res = await uploadReq();
  assert.equal(res.status, 401);
});

it('未登录无法查看文件列表（401）', async () => {
  const res = await jsonReq('GET', '/api/files');
  assert.equal(res.status, 401);
});

it('未登录无法搜索（401）', async () => {
  const res = await jsonReq('GET', '/api/search?q=test');
  assert.equal(res.status, 401);
});

it('工程师无法上传文件（403）', async () => {
  const res = await uploadReq(engCookie);
  assert.equal(res.status, 403);
});

it('工程师无法删除文件（403）', async () => {
  const res = await jsonReq('DELETE', '/api/files/1', null, engCookie);
  assert.equal(res.status, 403);
});

it('工程师可以搜索（200）', async () => {
  const res = await jsonReq('GET', '/api/search?q=39786', null, engCookie);
  assert.equal(res.status, 200);
});

it('工程师可以查看文件列表（200）', async () => {
  const res = await jsonReq('GET', '/api/files', null, engCookie);
  assert.equal(res.status, 200);
});

it('工程师可以查看 FAQ（200）', async () => {
  const res = await jsonReq('GET', '/api/faq', null, engCookie);
  assert.equal(res.status, 200);
});

it('工程师无法创建 FAQ（403）', async () => {
  const res = await jsonReq('POST', '/api/faq', { question: 'q', answer: 'a' }, engCookie);
  assert.equal(res.status, 403);
});

it('工程师无法查看操作日志（403）', async () => {
  const res = await jsonReq('GET', '/api/admin/logs', null, engCookie);
  assert.equal(res.status, 403);
});

it('工程师无法查看用户管理（403）', async () => {
  const res = await jsonReq('GET', '/api/admin/users', null, engCookie);
  assert.equal(res.status, 403);
});
