/**
 * 操作日志 API 测试
 *
 * Cycle 8: 日志
 *   1. 登录产生日志
 *   2. 上传产生日志
 *   3. 删除产生日志
 *   4. 日志包含操作人/操作/详情
 *   5. days/limit/offset 参数
 *   6. 非 admin 无法查看日志
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const dbDir = path.join(os.tmpdir(), `kb-test-logs-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;
process.env.KB_ADMIN_USER = 'logadmin';
process.env.KB_ADMIN_PASS = 'logpass123';
process.env.SESSION_SECRET = 'test-secret-logs';
process.env.KB_DIR = dbDir;

delete require.cache[require.resolve('../lib/database.cjs')];
const { initTables } = require('../lib/database.cjs');
initTables();

delete require.cache[require.resolve('../server_v2.cjs')];
const app = require('../server_v2.cjs');
const PORT = 19880;
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
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="log-test.txt"\r\nContent-Type: text/plain\r\n\r\n`),
      Buffer.from('log test content'),
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
    const req = http.request(opts, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>resolve({status:res.statusCode})); });
    req.write(body);
    req.end();
  });
}

let adminCookie = '';

before(async () => {
  await new Promise(r => server = app.listen(PORT, r));
  const res = await jsonReq('POST', '/api/auth/login', { username: 'logadmin', password: 'logpass123' });
  adminCookie = res.headers['set-cookie'];
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

it('登录后日志中有登录记录', async () => {
  const res = await jsonReq('GET', '/api/admin/logs?days=30', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.logs.length >= 1);
  const loginLog = res.body.logs.find(l => l.action === 'login');
  assert.ok(loginLog, '应包含登录日志');
  assert.equal(loginLog.username, 'logadmin');
  assert.ok(loginLog.detail);
});

it('上传文件后日志中有上传记录', async () => {
  await uploadReq(adminCookie);
  const res = await jsonReq('GET', '/api/admin/logs?days=30', null, adminCookie);
  const uploadLog = res.body.logs.find(l => l.action === 'upload');
  assert.ok(uploadLog, '应包含上传日志');
  assert.ok(uploadLog.detail.includes('log-test.txt'), '日志详情应包含文件名');
});

it('删除文件后日志中有删除记录', async () => {
  // 先查文件列表找到最新上传的文件
  const files = await jsonReq('GET', '/api/files', null, adminCookie);
  const lastFile = files.body[0];
  assert.ok(lastFile, '应有文件可删');

  await jsonReq('DELETE', `/api/files/${lastFile.id}`, null, adminCookie);

  const logRes = await jsonReq('GET', '/api/admin/logs?days=30', null, adminCookie);
  const deleteLog = logRes.body.logs.find(l => l.action === 'delete');
  assert.ok(deleteLog, '应包含删除日志');
  assert.ok(deleteLog.detail.includes(lastFile.original_name), '日志详情应包含被删除文件名');
});

it('日志接口返回 total 字段', async () => {
  const res = await jsonReq('GET', '/api/admin/logs?days=30', null, adminCookie);
  assert.ok(res.body.total >= 3, `total 应 >= 3, 实际 ${res.body.total}`);
  assert.ok(Array.isArray(res.body.logs));
  assert.equal(res.body.days, 30);
});

it('日志接口支持 limit 参数', async () => {
  const res = await jsonReq('GET', '/api/admin/logs?days=30&limit=1', null, adminCookie);
  assert.ok(res.body.logs.length <= 1);
});

it('日志接口支持 offset 参数', async () => {
  const res1 = await jsonReq('GET', '/api/admin/logs?days=30&limit=1&offset=0', null, adminCookie);
  const res2 = await jsonReq('GET', '/api/admin/logs?days=30&limit=1&offset=1', null, adminCookie);
  if (res1.body.logs.length && res2.body.logs.length) {
    assert.notEqual(res1.body.logs[0].id, res2.body.logs[0].id, '不同 offset 应返回不同条目');
  }
});
