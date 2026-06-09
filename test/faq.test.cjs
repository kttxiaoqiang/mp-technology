/**
 * FAQ API 测试
 *
 * Cycle 5: FAQ CRUD
 *   1. 创建 FAQ
 *   2. 查询 FAQ（全部 / 搜索）
 *   3. 更新 FAQ
 *   4. 删除 FAQ
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const dbDir = path.join(os.tmpdir(), `kb-test-faq-${Date.now()}`);
fs.mkdirSync(dbDir, { recursive: true });
process.env.KB_DATA_DIR = dbDir;
process.env.KB_ADMIN_USER = 'faqtest';
process.env.KB_ADMIN_PASS = 'faqpass123';
process.env.SESSION_SECRET = 'test-secret-faq';
process.env.KB_DIR = dbDir;
process.env.NODE_ENV = 'test';

delete require.cache[require.resolve('../lib/database.cjs')];
const { initTables } = require('../lib/database.cjs');
initTables();

delete require.cache[require.resolve('../server_v2.cjs')];
const app = require('../server_v2.cjs');
const PORT = 19878;
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

let adminCookie = '';

before(async () => {
  await new Promise(r => server = app.listen(PORT, r));
  const res = await jsonReq('POST', '/api/auth/login', { username: 'faqtest', password: 'faqpass123' });
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

it('创建 FAQ 返回 id', async () => {
  const res = await jsonReq('POST', '/api/faq', {
    question: '密评频率是多久？',
    answer: '三级系统每年一次，四级系统每半年一次。',
    category: '等保'
  }, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.id > 0);
  assert.equal(res.body.question, '密评频率是多久？');
  assert.equal(res.body.category, '等保');
});

it('创建 FAQ 缺少 question 返回 400', async () => {
  const res = await jsonReq('POST', '/api/faq', { answer: '没问题的答案' }, adminCookie);
  assert.equal(res.status, 400);
  assert.equal(res.body.error, '问题和答案不能为空');
});

it('创建 FAQ 缺少 answer 返回 400', async () => {
  const res = await jsonReq('POST', '/api/faq', { question: '有问题没答案' }, adminCookie);
  assert.equal(res.status, 400);
});

it('查询 FAQ 全部列表', async () => {
  // 先创建几个
  await jsonReq('POST', '/api/faq', { question: 'Q2', answer: 'A2', category: '' }, adminCookie);
  await jsonReq('POST', '/api/faq', { question: 'Q3', answer: 'A3', category: '等保' }, adminCookie);

  const res = await jsonReq('GET', '/api/faq', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.ok(res.body.length >= 3);
});

it('搜索 FAQ 按问题匹配', async () => {
  const res = await jsonReq('GET', '/api/faq?q=频率', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
  assert.ok(res.body.some(f => f.question.includes('频率')));
});

it('搜索 FAQ 按答案匹配', async () => {
  const res = await jsonReq('GET', '/api/faq?q=每年', null, adminCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.length >= 1);
});

it('搜索 FAQ 无结果返回空数组', async () => {
  const res = await jsonReq('GET', '/api/faq?q=__不存在的关键词__', null, adminCookie);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

it('更新 FAQ', async () => {
  // 先创建一个
  const createRes = await jsonReq('POST', '/api/faq', { question: '旧问题', answer: '旧答案', category: '旧' }, adminCookie);
  const id = createRes.body.id;

  const updateRes = await jsonReq('PUT', `/api/faq/${id}`, {
    question: '新问题',
    answer: '新答案',
    category: '新'
  }, adminCookie);
  assert.equal(updateRes.status, 200);

  // 查询验证
  const listRes = await jsonReq('GET', '/api/faq', null, adminCookie);
  const updated = listRes.body.find(f => f.id === id);
  assert.equal(updated.question, '新问题');
  assert.equal(updated.answer, '新答案');
  assert.equal(updated.category, '新');
});

it('删除 FAQ', async () => {
  const createRes = await jsonReq('POST', '/api/faq', { question: '待删除', answer: '再见', category: '' }, adminCookie);
  const id = createRes.body.id;

  const delRes = await jsonReq('DELETE', `/api/faq/${id}`, null, adminCookie);
  assert.equal(delRes.status, 200);

  const listRes = await jsonReq('GET', '/api/faq', null, adminCookie);
  assert.equal(listRes.body.find(f => f.id === id), undefined);
});
