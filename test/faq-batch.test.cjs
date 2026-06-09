/**
 * FAQ 批量管理 API 集成测试
 *
 * 使用 server_v2.cjs（默认导出 express app），启动独立测试实例。
 * 测试所有批量 API 端点。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const bcrypt = require('bcryptjs');

// ── 测试环境变量（在 import 模块前设置） ──
const DATA_DIR = path.join(os.tmpdir(), `kb-faq-batch-test-${Date.now()}`);
const KNOWLEDGE_DIR = path.join(os.tmpdir(), `kb-faq-batch-knowledge-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(KNOWLEDGE_DIR, { recursive: true });

process.env.KB_DATA_DIR = DATA_DIR;
process.env.KNOWLEDGE_BASE = KNOWLEDGE_DIR;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-faq-batch';
process.env.KB_ADMIN_USER = 'admin';
process.env.KB_ADMIN_PASS = '123456';

const TEST_PORT = 20050 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// ── HTTP client with cookie management ──
class Client {
  constructor(base) {
    this.base = base;
    this.cookies = '';
  }

  request(method, urlPath, body, contentType) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.base);
      const opts = {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {}
      };
      if (this.cookies) opts.headers['Cookie'] = this.cookies;
      if (body && !contentType && typeof body === 'object' && !(body instanceof Buffer)) {
        opts.headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
      if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);

      const req = http.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          const ct = res.headers['content-type'] || '';
          if (ct.includes('application/json')) {
            try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
            catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
          } else {
            try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
            catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(); reject(new Error('Request timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }

  async login(username, password) {
    return this.request('POST', '/api/auth/login', { username, password });
  }

  get(urlPath) { return this.request('GET', urlPath); }
  post(urlPath, body) { return this.request('POST', urlPath, body); }
  put(urlPath, body) { return this.request('PUT', urlPath, body); }

  upload(urlPath, filePath) {
    const boundary = '----TestBoundary' + Date.now();
    const content = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    let head = '';
    head += `--${boundary}\r\n`;
    head += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    head += `Content-Type: application/octet-stream\r\n\r\n`;

    const bodyParts = [
      Buffer.from(head),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ];

    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.base);
      const opts = {
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': Buffer.concat(bodyParts).length,
          ...(this.cookies ? { Cookie: this.cookies } : {})
        }
      };
      const req = http.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          this.cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on('error', reject);
      req.write(Buffer.concat(bodyParts));
      req.end();
    });
  }
}

// ── Pre-seed DB with admin user ──
function seedDb() {
  delete require.cache[path.resolve(__dirname, '../lib/database.cjs')];
  const { getDb, initTables } = require('../lib/database.cjs');
  initTables();

  const db = getDb();

  // Create admin user
  const hash = bcrypt.hashSync('123456', 10);
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');

  // Create a regular user
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('user', bcrypt.hashSync('userpass', 10), 'user');

  // Seed 5 FAQ entries (with new columns for PRD-007)
  const insert = db.prepare('INSERT INTO faq (question, answer, category, created_by) VALUES (?, ?, ?, ?)');
  for (let i = 1; i <= 3; i++) {
    insert.run(`测试问题${i}`, `这是测试答案${i}`, '基础', 1);
  }
  for (let i = 1; i <= 2; i++) {
    insert.run(`等保问题${i}`, `等保答案${i}`, '等保', 1);
  }

  db.close();
  delete require.cache[path.resolve(__dirname, '../lib/database.cjs')];
}

let server;

// ── Start server.cjs on the test port ──
function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PORT: String(TEST_PORT),
      KB_DATA_DIR: DATA_DIR,
      KNOWLEDGE_BASE: KNOWLEDGE_DIR,
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-secret-batch',
      KB_ADMIN_USER: 'admin',
      KB_ADMIN_PASS: '123456'
    };

    const { spawn } = require('child_process');
    const child = spawn('node', ['server.cjs'], {
      cwd: '/home/zhang/kb-web',
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', d => output += d.toString());
    child.stderr.on('data', d => output += d.toString());
    child.on('error', reject);

    // Poll until server is up
    const poll = async (retries) => {
      if (retries <= 0) return reject(new Error(`Server not ready. Output: ${output}`));
      try {
        await new Promise((r, j) => {
          const req = http.get(`http://127.0.0.1:${TEST_PORT}/api/faq`, res => { res.resume(); r(); });
          req.on('error', j);
          req.setTimeout(2000, () => { req.destroy(); j(new Error('timeout')); });
        });
        resolve(child);
      } catch {
        setTimeout(() => poll(retries - 1), 500);
      }
    };
    poll(20);
  });
}

function stopServer() {
  // Clean up
  delete require.cache[path.resolve(__dirname, '../lib/database.cjs')];
  delete require.cache[path.resolve(__dirname, '../server.cjs')];
  const { closeDb } = require('../lib/database.cjs');
  try { closeDb(); } catch {}
}

// ── Test suite ──
describe('FAQ 批量管理 API', () => {
  let client;

  before(async () => {
    seedDb();
    await startServer();
    client = new Client(BASE_URL);
    const loginRes = await client.login('admin', '123456');
    assert.equal(loginRes.status, 200, `Login failed: ${JSON.stringify(loginRes.body)}`);
  });

  after(() => {
    stopServer();
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(KNOWLEDGE_DIR, { recursive: true, force: true }); } catch {}
  });

  it('1. GET /api/faq/categories 返回去重分类列表', async () => {
    const res = await client.get('/api/faq/categories');
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body), `应为数组: ${JSON.stringify(res.body).slice(0, 60)}`);
    assert.ok(res.body.includes('基础'), `应含"基础": ${res.body.join(', ')}`);
    assert.ok(res.body.includes('等保'), `应含"等保": ${res.body.join(', ')}`);
    assert.equal(new Set(res.body).size, res.body.length, '分类值应唯一');
  });

  it('2. POST /api/faq/batch-delete 批量删除指定条目', async () => {
    const allRes = await client.get('/api/faq');
    const faqs = allRes.body;
    const ids = faqs.map(f => f.id);
    const toDelete = ids.slice(0, 2);

    const delRes = await client.post('/api/faq/batch-delete', { ids: toDelete });
    assert.equal(delRes.status, 200, `删除失败: ${JSON.stringify(delRes.body)}`);
    assert.equal(delRes.body.deleted, 2, `应删除2条: ${JSON.stringify(delRes.body)}`);

    const remainRes = await client.get('/api/faq');
    const remain = remainRes.body;
    assert.equal(remain.length, 3, `应该剩3条: ${remain.map(f => f.question).join(', ')}`);
    const remainIds = remain.map(f => f.id);
    for (const id of toDelete) {
      assert.ok(!remainIds.includes(id), `id ${id} 不应存在`);
    }
  });

  it('3. PUT /api/faq/batch-category 批量修改分类', async () => {
    const allRes = await client.get('/api/faq');
    const faqs = allRes.body;
    const targetIds = faqs.filter(f => f.category === '等保').map(f => f.id);
    assert.ok(targetIds.length > 0, '应有等保类条目');

    const catRes = await client.put('/api/faq/batch-category', { ids: targetIds, category: '合规' });
    assert.equal(catRes.status, 200, `批量分类失败: ${JSON.stringify(catRes.body)}`);
    assert.equal(catRes.body.updated, targetIds.length, `应更新 ${targetIds.length} 条`);

    const checkRes = await client.get('/api/faq');
    const check = checkRes.body;
    for (const f of check) {
      if (targetIds.includes(f.id)) {
        assert.equal(f.category, '合规', `条目 ${f.id} 分类应变更为"合规"`);
      }
    }
  });

  it('4. POST /api/faq/import 导入 CSV 文件', async () => {
    const csvPath = path.join(os.tmpdir(), `faq-csv-${Date.now()}.csv`);
    const csv = 'question,answer,category\n导入问题1,导入答案1,基础\n导入问题2,导入答案2,等保\n';
    fs.writeFileSync(csvPath, csv);

    const res = await client.upload('/api/faq/import', csvPath);
    assert.equal(res.status, 200, `CSV 导入失败: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.imported, 2, `应导入2条: ${JSON.stringify(res.body)}`);

    const all = await client.get('/api/faq');
    assert.ok(all.body.some(f => f.question === '导入问题1'), '导入的条目应存在');
    fs.unlinkSync(csvPath);
  });

  it('5. POST /api/faq/import 导入 JSON 文件', async () => {
    const jsonPath = path.join(os.tmpdir(), `faq-json-${Date.now()}.json`);
    const json = JSON.stringify([
      { question: 'JSON问题1', answer: 'JSON答案1', category: '技术标准' },
      { question: 'JSON问题2', answer: 'JSON答案2', category: '合规' }
    ]);
    fs.writeFileSync(jsonPath, json);

    const res = await client.upload('/api/faq/import', jsonPath);
    assert.equal(res.status, 200, `JSON 导入失败: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.imported, 2);

    const all = await client.get('/api/faq');
    assert.ok(all.body.some(f => f.question === 'JSON问题1'));
    fs.unlinkSync(jsonPath);
  });

  it('6. GET /api/faq/export?format=json 导出 JSON', async () => {
    const res = await client.get('/api/faq/export?format=json');
    assert.equal(res.status, 200);
    const ct = res.headers['content-type'] || '';
    assert.ok(ct.includes('application/json'), `Content-Type: ${ct}`);
    const data = Array.isArray(res.body) ? res.body : [];
    assert.ok(data.length > 0, '应有数据');
    assert.ok(data[0].question, '应有 question 字段');
  });

  it('7. GET /api/faq/export?format=csv 导出 CSV', async () => {
    const res = await client.get('/api/faq/export?format=csv');
    assert.equal(res.status, 200);
    assert.ok(res.body.includes('question'), `CSV 应含表头: ${res.body.slice(0, 50)}`);
    assert.ok(res.body.includes('导入问题1'), `CSV 应含数据: ${res.body.slice(0, 300)}`);
  });

  it('8. GET /api/faq/export?format=json&category=基础 按分类导出', async () => {
    const res = await client.get('/api/faq/export?format=json&category=基础');
    const data = Array.isArray(res.body) ? res.body : [];
    for (const f of data) {
      assert.equal(f.category, '基础', `分类应为"基础": ${f.question}`);
    }
  });
});
