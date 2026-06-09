/**
 * 批量目录上传 API 测试
 *
 * 通过 HTTP 请求验证 POST /api/upload-batch 的行为。
 * 使用已在运行的 kb-web 服务（默认 http://localhost:3344）。
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3344';
const BASE_PARTS = new URL(BASE_URL);

// HTTP 请求辅助（含 cookie 管理）
class Client {
  constructor() {
    this.cookies = '';
  }

  request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
      const opts = {
        method,
        hostname: BASE_PARTS.hostname,
        port: parseInt(BASE_PARTS.port) || 80,
        path: urlPath,
        headers: {
          'Content-Type': 'application/json',
          ...(this.cookies ? { 'Cookie': this.cookies } : {})
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
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async login(username, password) {
    return this.request('POST', '/api/auth/login', { username, password });
  }

  async uploadBatch(dirPath) {
    return this.request('POST', '/api/upload-batch', { dirPath });
  }
}

// 测试源目录（4 个文件分布在子目录中）
const testDir = path.join(os.tmpdir(), `batch-src-${Date.now()}`);

describe('批量目录上传', () => {
  let client;

  before(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, '密码应用方案书.txt'), '## 密码应用安全性评估方案');
    fs.writeFileSync(path.join(testDir, 'readme.txt'), 'hello world');
    fs.mkdirSync(path.join(testDir, 'sub'));
    fs.writeFileSync(path.join(testDir, 'sub', '评估报告.md'), '# 密码应用评估报告');
    fs.mkdirSync(path.join(testDir, 'sub', 'deep'));
    fs.writeFileSync(path.join(testDir, 'sub', 'deep', '密评FAQ.md'), '# 常见问题');
  });

  after(() => {
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
  });

  it('1. 上传整个目录（递归），4 个文件全部成功，自动分类正确', async () => {
    client = new Client();
    await client.login('admin', '123456');

    const res = await client.uploadBatch(testDir);
    assert.equal(res.body.success, true, JSON.stringify(res.body));
    assert.equal(res.body.count, 4, `应上传 4 个文件: ${res.body.files.map(f => f.name).join(', ')}`);
    assert.equal(res.body.successCount, 4);
    assert.equal(res.body.failCount, 0);

    const names = res.body.files.map(f => f.name);
    assert.ok(names.includes('密码应用方案书.txt'), `应有密码应用方案书.txt，实际: ${names.join(', ')}`);
    assert.ok(names.includes('readme.txt'));
    assert.ok(names.includes('评估报告.md'));
    assert.ok(names.includes('密评FAQ.md'));

    const schemeFile = res.body.files.find(f => f.name === '密码应用方案书.txt');
    assert.equal(schemeFile.category, '方案', `方案书分类: ${schemeFile.category}`);

    const reportFile = res.body.files.find(f => f.name === '评估报告.md');
    assert.equal(reportFile.category, '报告', `报告分类: ${reportFile.category}`);

    const faqFile = res.body.files.find(f => f.name === '密评FAQ.md');
    assert.equal(faqFile.category, '密评FAQ', `FAQ分类: ${faqFile.category}`);

    // 清理本次测试上传的文件
    for (const f of res.body.files) {
      const target = path.join('/home/zhang/company_knowledge_base', f.category === '其他' ? '' : f.category, f.name);
      try { fs.unlinkSync(target); } catch {}
      // also clean md version if exists
      if (f.converted && f.mdFile) {
        const mdPath = path.join('/home/zhang/company_knowledge_base', f.category === '其他' ? '' : f.category, f.mdFile);
        try { fs.unlinkSync(mdPath); } catch {}
      }
    }
  });

  it('2. 重复上传同一目录，自动加序号避免覆盖', async () => {
    let res = await client.uploadBatch(testDir);
    assert.equal(res.body.success, true);
    // 第一次上传的 4 个文件
    const firstNames = res.body.files.map(f => f.name);

    // 第二次上传，应有序号
    res = await client.uploadBatch(testDir);
    assert.equal(res.body.success, true);
    const secondNames = res.body.files.map(f => f.name);
    const hasNumbered = secondNames.some(n => /_\d+\./.test(n));
    assert.ok(hasNumbered, `重复文件应有序号: ${secondNames.join(', ')}`);
    assert.equal(new Set(secondNames).size, secondNames.length, '所有文件名应唯一');

    // 清理
    for (const f of [...firstNames, ...secondNames]) {
      for (const dir of ['', '方案', '报告', '密评FAQ', '其他']) {
        const fp = path.join('/home/zhang/company_knowledge_base', dir, f.name || f);
        try { fs.unlinkSync(fp); } catch {}
      }
    }
  });

  it('3. 不存在的目录返回 400 错误', async () => {
    const res = await client.uploadBatch('/nonexistent_dir_abcxyz');
    assert.equal(res.status, 400, `状态码应为 400: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.error && res.body.error.includes('不存在'), `错误信息: ${res.body.error}`);
  });

  it('4. 空目录返回 count=0', async () => {
    const emptyDir = path.join(os.tmpdir(), `empty-${Date.now()}`);
    fs.mkdirSync(emptyDir);
    const res = await client.uploadBatch(emptyDir);
    assert.equal(res.body.count, 0);
    assert.equal(res.body.successCount, 0);
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('5. 文件路径（非目录）返回错误', async () => {
    const res = await client.uploadBatch(`${testDir}/readme.txt`);
    assert.equal(res.status, 400, `状态码应为 400: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.error, `应有错误信息: ${JSON.stringify(res.body)}`);
  });

  it('6. 缺省 dirPath 返回错误', async () => {
    const res = await client.request('POST', '/api/upload-batch', {});
    assert.equal(res.status, 400, `状态码应为 400: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.error, `应有错误信息: ${JSON.stringify(res.body)}`);
  });
});
