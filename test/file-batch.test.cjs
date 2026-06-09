/**
 * 文件批量管理 API 集成测试
 *
 * 文件系统是 Source of Truth（无 DB files 表），
 * 批量操作通过 relativePath 数组标识文件。
 * 每个测试用例独立验证文件系统状态。
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const bcrypt = require('bcryptjs');

// ── 测试环境变量 ──
const DATA_DIR = path.join(os.tmpdir(), `kb-file-batch-test-${Date.now()}`);
const KNOWLEDGE_DIR = path.join(os.tmpdir(), `kb-file-batch-knowledge-${Date.now()}`);
fs.mkdirSync(DATA_DIR, { recursive: true });

function initKnowledgeDir() {
  const CATS = ['方案', '报告', '密评FAQ', '标准规范', '法规政策', '参考文档', '其他'];
  for (const c of CATS) {
    fs.mkdirSync(path.join(KNOWLEDGE_DIR, c), { recursive: true });
  }
}
initKnowledgeDir();

process.env.KB_DATA_DIR = DATA_DIR;
process.env.KNOWLEDGE_BASE = KNOWLEDGE_DIR;
process.env.KB_PATH = KNOWLEDGE_DIR;
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-file-batch';
process.env.KB_ADMIN_USER = 'admin';
process.env.KB_ADMIN_PASS = '123456';

const TEST_PORT = 20100 + Math.floor(Math.random() * 1000);
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// ── HTTP client ──
class Client {
  constructor(base) {
    this.base = base;
    this.cookies = '';
  }
  request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(urlPath, this.base);
      const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: {} };
      if (this.cookies) opts.headers['Cookie'] = this.cookies;
      if (body && typeof body === 'object' && !(body instanceof Buffer)) {
        opts.headers['Content-Type'] = 'application/json';
        body = JSON.stringify(body);
      }
      if (body && typeof body === 'string') opts.headers['Content-Length'] = Buffer.byteLength(body);
      const req = http.request(opts, (res) => {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) this.cookies = setCookie.map(c => c.split(';')[0]).join('; ');
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers }); }
          catch { resolve({ status: res.statusCode, body: data, headers: res.headers }); }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
      if (body) req.write(body);
      req.end();
    });
  }
  async login(username, password) { return this.request('POST', '/api/auth/login', { username, password }); }
  get(urlPath) { return this.request('GET', urlPath); }
  post(urlPath, body) { return this.request('POST', urlPath, body); }
  put(urlPath, body) { return this.request('PUT', urlPath, body); }
}

// ── 预置 admin 用户 ──
function seedDb() {
  delete require.cache[path.resolve(__dirname, '../lib/database.cjs')];
  const { getDb, initTables } = require('../lib/database.cjs');
  initTables();
  const db = getDb();
  const hash = bcrypt.hashSync('123456', 10);
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hash, 'admin');
  db.prepare('INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('user', bcrypt.hashSync('userpass', 10), 'user');
  db.close();
  delete require.cache[path.resolve(__dirname, '../lib/database.cjs')];
}

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn('node', ['server.cjs'], {
      cwd: '/home/zhang/kb-web',
      env: { ...process.env, PORT: String(TEST_PORT), KB_DATA_DIR: DATA_DIR, KNOWLEDGE_BASE: KNOWLEDGE_DIR, KB_PATH: KNOWLEDGE_DIR },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', d => output += d.toString());
    child.stderr.on('data', d => output += d.toString());
    child.on('error', reject);
    const poll = async (retries) => {
      if (retries <= 0) return reject(new Error(`Server not ready. Out: ${output.slice(0,200)}`));
      try {
        await new Promise((r, j) => {
          const req = http.get(`http://127.0.0.1:${TEST_PORT}/api/files`, res => { res.resume(); r(); });
          req.on('error', j);
          req.setTimeout(2000, () => { req.destroy(); j(new Error('timeout')); });
        });
        resolve(child);
      } catch { setTimeout(() => poll(retries - 1), 500); }
    };
    poll(20);
  });
}

function p(subdir, name) {
  return path.join(KNOWLEDGE_DIR, subdir || '', name || '');
}

// ── Tests ──
describe('文件批量管理 API', () => {
  let client;

  before(async () => {
    seedDb();
    server = await startServer();
    client = new Client(BASE_URL);
    const loginRes = await client.login('admin', '123456');
    assert.equal(loginRes.status, 200, `Login failed: ${JSON.stringify(loginRes.body)}`);
  });

  after(() => {
    try { process.kill(server.pid); } catch {}
    try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(KNOWLEDGE_DIR, { recursive: true, force: true }); } catch {}
  });

  it('1. POST /api/files/batch-delete 批量删除（文件 + .md + _images）', async () => {
    // 准备测试文件
    initKnowledgeDir();
    fs.writeFileSync(p('其他', 'del_a.txt'), 'a');
    fs.writeFileSync(p('其他', 'del_a.md'), '# a');
    fs.writeFileSync(p('其他', 'del_b.txt'), 'b');
    fs.writeFileSync(p('其他', 'del_b.md'), '# b');
    const imgDir = p('其他', '_images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, 'del_a_screenshot.png'), 'img');

    assert.ok(fs.existsSync(p('其他', 'del_a.txt')));
    assert.ok(fs.existsSync(p('其他', 'del_a.md')));
    assert.ok(fs.existsSync(path.join(imgDir, 'del_a_screenshot.png')));

    const delRes = await client.post('/api/files/batch-delete', {
      paths: ['其他/del_a.txt', '其他/del_b.txt']
    });
    assert.equal(delRes.status, 200, `删除失败: ${JSON.stringify(delRes.body)}`);
    assert.equal(delRes.body.deleted, 2, `应删除 2 个: ${JSON.stringify(delRes.body)}`);

    assert.ok(!fs.existsSync(p('其他', 'del_a.txt')), '源文件已删除');
    assert.ok(!fs.existsSync(p('其他', 'del_a.md')), '.md 已删除');
    assert.ok(!fs.existsSync(path.join(imgDir, 'del_a_screenshot.png')), '关联图片已删除');
    assert.ok(!fs.existsSync(p('其他', 'del_b.txt')), '源文件b已删除');
    assert.ok(!fs.existsSync(p('其他', 'del_b.md')), '.md b已删除');
  });

  it('2. POST /api/files/batch-delete 不存在的路径跳过', async () => {
    const delRes = await client.post('/api/files/batch-delete', {
      paths: ['nonexistent/file.txt', '其他/nonexistent.doc']
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.deleted, 0, `跳过不存在的文件: ${JSON.stringify(delRes.body)}`);
  });

  it('3. POST /api/files/batch-delete 非管理员 403', async () => {
    const userClient = new Client(BASE_URL);
    await userClient.login('user', 'userpass');
    const delRes = await userClient.post('/api/files/batch-delete', { paths: ['其他/some.txt'] });
    assert.equal(delRes.status, 403);
  });

  it('4. PUT /api/files/batch-category 批量改分类并物理移动', async () => {
    initKnowledgeDir();
    fs.writeFileSync(p('其他', 'cat_a.txt'), 'a');
    fs.writeFileSync(p('其他', 'cat_a.md'), '# a');
    fs.writeFileSync(p('其他', 'cat_b.txt'), 'b');
    fs.writeFileSync(p('其他', 'cat_b.md'), '# b');

    const catRes = await client.put('/api/files/batch-category', {
      paths: ['其他/cat_a.txt', '其他/cat_b.txt'],
      category: '报告'
    });
    assert.equal(catRes.status, 200, `分类失败: ${JSON.stringify(catRes.body)}`);
    assert.equal(catRes.body.updated, 2, `应更新 2 个`);

    // 原目录无文件
    assert.ok(!fs.existsSync(p('其他', 'cat_a.txt')), '原目录文件已移除');
    assert.ok(!fs.existsSync(p('其他', 'cat_a.md')), '原目录 .md 已移除');

    // 目标目录有文件
    assert.ok(fs.existsSync(p('报告', 'cat_a.txt')), '目标目录文件存在');
    assert.ok(fs.existsSync(p('报告', 'cat_a.md')), '目标目录 .md 存在');
    assert.ok(fs.existsSync(p('报告', 'cat_b.txt')), '目标目录文件b存在');
    assert.ok(fs.existsSync(p('报告', 'cat_b.md')), '目标目录 .md b存在');
  });

  it('5. PUT /api/files/batch-category 无效分类返回 400', async () => {
    const catRes = await client.put('/api/files/batch-category', {
      paths: ['其他/cat_a.txt'],
      category: '无效分类'
    });
    assert.equal(catRes.status, 400, `无效分类应 400: ${JSON.stringify(catRes.body)}`);
  });

  it('6. PUT /api/files/batch-category 非管理员 403', async () => {
    const userClient = new Client(BASE_URL);
    await userClient.login('user', 'userpass');
    const catRes = await userClient.put('/api/files/batch-category', {
      paths: ['其他/some.txt'], category: '方案'
    });
    assert.equal(catRes.status, 403);
  });

  it('7. PUT /api/files/batch-category _images 同步移动', async () => {
    initKnowledgeDir();
    fs.writeFileSync(p('其他', 'img_test.txt'), 'test');
    fs.writeFileSync(p('其他', 'img_test.md'), '# test');
    const imgDir = p('其他', '_images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, 'img_test_screenshot.png'), 'fake png');

    assert.ok(fs.existsSync(path.join(imgDir, 'img_test_screenshot.png')), '图片在源目录');

    const catRes = await client.put('/api/files/batch-category', {
      paths: ['其他/img_test.txt'],
      category: '方案'
    });
    assert.equal(catRes.status, 200);
    assert.equal(catRes.body.updated, 1);

    const destImgDir = p('方案', '_images');
    assert.ok(fs.existsSync(path.join(destImgDir, 'img_test_screenshot.png')), '图片在目标目录');
    assert.ok(!fs.existsSync(path.join(imgDir, 'img_test_screenshot.png')), '源图片已移除');
  });

  it('8. POST /api/files/batch-delete 删除包含 .md 和 _images 的完整清理', async () => {
    initKnowledgeDir();
    fs.writeFileSync(p('方案', 'full_del.txt'), 'full');
    fs.writeFileSync(p('方案', 'full_del.md'), '# full');
    const imgDir = p('方案', '_images');
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, 'full_del_ss.png'), 'img');

    const delRes = await client.post('/api/files/batch-delete', {
      paths: ['方案/full_del.txt']
    });
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.deleted, 1);

    assert.ok(!fs.existsSync(p('方案', 'full_del.txt')), '源文件已删');
    assert.ok(!fs.existsSync(p('方案', 'full_del.md')), '.md 已删');
    assert.ok(!fs.existsSync(path.join(imgDir, 'full_del_ss.png')), '图片已删');
  });
});
