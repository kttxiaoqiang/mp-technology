/**
 * 文件上传/列表/分类/删除 API 测试
 * 
 * Cycle 4: 文件操作
 *   1. 上传文件（登录后）
 *   2. 自动分类（方案/报告/标准/其他）
 *   3. 文件列表（全部/按分类）
 *   4. 删除文件
 *   5. 未登录拒绝上传
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// ─── 准备 ──────────────────────────────────────
const dbDir = path.join(os.tmpdir(), `kb-test-files-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;
process.env.KB_ADMIN_USER = 'filetest';
process.env.KB_ADMIN_PASS = 'filepass123';
process.env.SESSION_SECRET = 'test-secret-files';
process.env.KB_DIR = dbDir;

delete require.cache[require.resolve('../lib/database.cjs')];
const { initTables } = require('../lib/database.cjs');
initTables();

delete require.cache[require.resolve('../server_v2.cjs')];
const app = require('../server_v2.cjs');
const PORT = 19877;
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

function uploadReq(fileName, fileContent, cookie) {
  return new Promise((resolve) => {
    const boundary = '----' + crypto.randomBytes(8).toString('hex');
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
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

let adminCookie = '';

before(async () => {
  await new Promise(r => server = app.listen(PORT, r));
  // 登录获取 cookie
  const res = await jsonReq('POST', '/api/auth/login', { username: 'filetest', password: 'filepass123' });
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

// ─── 测试 ──────────────────────────────────────
it('上传文件后返回 id 和分类', async () => {
  const res = await uploadReq('等保三级评估方案.docx', '这是方案文件内容', adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.id > 0);
  assert.equal(res.body.original_name, '等保三级评估方案.docx');
  assert.equal(res.body.category, '方案'); // 方案关键词触发
});

it('上传文件自动分类：报告类', async () => {
  const res = await uploadReq('2026年密评报告.pdf', '这是报告内容', adminCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '报告');
});

it('上传文件自动分类：标准类', async () => {
  const res = await uploadReq('GB-T-39786-标准规范.pdf', '标准内容', adminCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '标准法规参考');
});

it('上传文件自动分类：其他（无匹配关键词）', async () => {
  const res = await uploadReq('随便一个文件.txt', '其他内容', adminCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.category, '其他');
});

it('上传文件保留原始中文文件名', async () => {
  const res = await uploadReq('密码算法对比.xlsx', 'excel内容', adminCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.original_name, '密码算法对比.xlsx');
});

it('文件列表返回所有已上传文件', async () => {
  const res = await jsonReq('GET', '/api/files', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 5);
  // 最新上传的应该在前面
  assert.equal(res.body[0].original_name, '密码算法对比.xlsx');
});

it('文件列表支持按分类筛选', async () => {
  const res = await jsonReq('GET', '/api/files?category=方案', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
  assert.ok(res.body.every(f => f.category === '方案'));
});

it('文件列表返回的条目包含必要字段', async () => {
  const res = await jsonReq('GET', '/api/files', null, adminCookie);
  const file = res.body[0];
  assert.ok(file.id !== undefined);
  assert.ok(file.original_name);
  assert.ok(file.category);
  assert.ok(file.file_size !== undefined);
  assert.ok(file.created_at);
});

it('删除文件后文件列表不再包含', async () => {
  // 先查最后一个文件（"其他"类那个）
  const listRes = await jsonReq('GET', '/api/files?category=其他', null, adminCookie);
  const target = listRes.body[0];
  assert.ok(target, '应有其他类文件');

  const delRes = await jsonReq('DELETE', `/api/files/${target.id}`, null, adminCookie);
  assert.equal(delRes.status, 200);

  // 验证已删除
  const list2 = await jsonReq('GET', '/api/files?category=其他', null, adminCookie);
  assert.equal(list2.body.find(f => f.id === target.id), undefined);
});

it('删除不存在的文件返回 404', async () => {
  const res = await jsonReq('DELETE', '/api/files/99999', null, adminCookie);
  assert.equal(res.status, 404);
  assert.equal(res.body.error, '文件不存在');
});
