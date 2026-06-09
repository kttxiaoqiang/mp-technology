/**
 * tests/api/download.test.cjs
 * TDD: 文件下载功能测试
 *
 * 行为测试清单：
 * 1. RED: 上传后能通过 downloadPath 下载原始文件
 * 2. RED: 下载的原始文件内容和上传一致
 * 3. RED: 搜索结果的 originalDownloadPath 有效
 * 4. GREEN: 实现 upload 返回 downloadPath
 * 5. GREEN: 实现前端下载按钮
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3344';

test.describe('文件下载', () => {

  // ─── 测试1: 上传 txt 文件后能下载 ───
  test('上传普通文件后可通过 downloadPath 下载', async ({ request }) => {
    const fixture = '/home/zhang/kb-web/tests/fixtures/test_sample.txt';
    const content = fs.readFileSync(fixture);
    const originalContent = content.toString('utf-8');

    // 上传
    const uploadRes = await request.post(`${BASE}/api/upload`, {
      multipart: {
        file: { name: 'tdd_download_test.txt', mimeType: 'text/plain', buffer: content }
      }
    });
    expect(uploadRes.ok()).toBeTruthy();
    const uploadData = await uploadRes.json();
    console.log('[tdd] upload result:', JSON.stringify(uploadData, null, 2));

    // 检查 upload 返回的 file 有 downloadPath
    expect(uploadData.file).toBeDefined();
    // TODO: 第一次 RED —— 期待 downloadPath 存在但不存在
    expect(uploadData.file.downloadPath).toBeDefined();
    expect(typeof uploadData.file.downloadPath).toBe('string');

    // 通过 downloadPath 下载
    const dlRes = await request.get(`${BASE}${uploadData.file.downloadPath}`);
    expect(dlRes.ok()).toBeTruthy();
    const dlBuffer = await dlRes.body();
    expect(dlBuffer.toString('utf-8')).toBe(originalContent);
  });

  // ─── 测试2: 上传非文本文件 (docx) 下载 ───
  test('上传 docx 文件后下载原始文件', async ({ request }) => {
    // 用已存在的 docx 文件测试
    const kbPath = '/home/zhang/company_knowledge_base';
    const files = fs.readdirSync(kbPath);
    const docxFile = files.find(f => f.endsWith('.docx'));
    test.skip(!docxFile, '没有 docx 文件可测试');

    const dlRes = await request.get(`${BASE}/api/download/${encodeURIComponent(docxFile)}`);
    expect(dlRes.ok()).toBeTruthy();
    const contentType = dlRes.headers()['content-type'];
    expect(contentType).toMatch(/octet-stream|vnd\.openxmlformats-officedocument/);
  });

  // ─── 测试3: 搜索结果中的 originalDownloadPath ───
  test('搜索结果的 originalDownloadPath 可下载', async ({ request }) => {
    const fixture = '/home/zhang/kb-web/tests/fixtures/test_sample.txt';
    const content = fs.readFileSync(fixture);

    // 上传一个便于搜索的文件
    const uploadRes = await request.post(`${BASE}/api/upload`, {
      multipart: {
        file: { name: 'tdd_search_download.txt', mimeType: 'text/plain', buffer: content }
      }
    });
    expect(uploadRes.ok()).toBeTruthy();

    // 搜索
    const searchRes = await request.get(`${BASE}/api/search?q=Hello+World`);
    expect(searchRes.ok()).toBeTruthy();
    const searchData = await searchRes.json();
    console.log('[tdd] search results:', searchData.count);

    // TODO: 检查搜索结果的 originalDownloadPath
    // 但 txt 不会转换 .md，所以搜不到。这引出下一个行为
  });

  // ─── 测试4: txt 上传后自动转为 .md ───
  test('txt 文件上传后自动生成 .md 供搜索', async ({ request }) => {
    const fixture = '/home/zhang/kb-web/tests/fixtures/test_sample.txt';
    const content = fs.readFileSync(fixture);
    const originalText = content.toString('utf-8');

    const uploadRes = await request.post(`${BASE}/api/upload`, {
      multipart: {
        file: { name: 'tdd_txt_to_md.txt', mimeType: 'text/plain', buffer: content }
      }
    });
    expect(uploadRes.ok()).toBeTruthy();
    const uploadData = await uploadRes.json();

    // txt 应该也被转为 .md
    expect(uploadData.convertedToMd).toBeTruthy();
    expect(uploadData.mdFile).toBeTruthy();
    expect(uploadData.mdFile).toMatch(/\.md$/);
  });

  // ─── 测试5: 下载路径安全 ───
  test('路径穿越下载被拒绝', async ({ request }) => {
    // URL-encoded .. download is blocked by path resolution check
    const dlRes2 = await request.get(`${BASE}/api/download/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd`);
    expect(dlRes2.status()).toBe(403);
  });
});
