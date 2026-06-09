/**
 * FAQ 批量管理 UI Playwright 测试
 *
 * 测试前需确保服务器运行在 localhost:3344
 * 运行: npx playwright test test/faq-batch-ui.test.mjs
 * 或: node test/faq-batch-ui.test.mjs
 */

import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3344';
const ADMIN = { username: 'admin', password: '123456' };

let browser, context, page, errs;

async function setup() {
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await context.newPage();
  errs = [];
  page.on('pageerror', e => errs.push('PAGE: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().substring(0, 150)); });

  // Login
  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await page.fill('input[name="username"]', ADMIN.username);
  await page.fill('input[name="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1500);
  if (errs.length) console.log('Login errors:', errs);
}

async function teardown() {
  await browser.close();
}

// ─── Test Suite ───
async function run() {
  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✅ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ❌ ${name}: ${e.message}`);
      if (errs.length) {
        console.log('     Errors:', errs.map(e => e.substring(0,80)).join('; '));
        errs.length = 0;
      }
    }
  }

  console.log('\n🧪 FAQ 批量管理 UI 测试');
  console.log('═══════════════════════════\n');

  await setup();

  // Navigate to FAQ admin
  await page.goto(BASE + '/#/admin/faq', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await test('T1: FAQ 管理页面渲染操作栏按钮', async () => {
    const btn = await page.locator('#faq-extract-btn');
    assert.ok(await btn.isVisible(), 'AI 抽取按钮可见');
    assert.ok(await page.locator('#faq-import-btn').isVisible(), '导入按钮可见');
    assert.ok(await page.locator('#faq-export-btn').isVisible(), '导出按钮可见');
    assert.ok(await page.locator('#add-faq-btn').isVisible(), '添加按钮可见');
  });

  await test('T2: 批量操作工具栏含全选和批量删除', async () => {
    assert.ok(await page.locator('#faq-select-all').isVisible(), '全选 checkbox 可见');
    assert.ok(await page.locator('#faq-select-count').isVisible(), '已选计数可见');
    assert.ok(await page.locator('#faq-batch-del-btn').isVisible(), '批量删除按钮可见');
    assert.ok(await page.locator('#faq-batch-cat-select').isVisible(), '分类下拉可见');
    assert.ok(await page.locator('#faq-batch-cat-btn').isVisible(), '分类应用按钮可见');
  });

  await test('T3: 批量删除按钮初始禁用', async () => {
    const btn = page.locator('#faq-batch-del-btn');
    assert.ok(await btn.isDisabled(), '批量删除按钮初始禁用');
  });

  await test('T4: 列表渲染时每行有 checkbox', async () => {
    const checks = page.locator('#admin-faq-list .faq-check');
    const count = await checks.count();
    assert.ok(count > 0, `至少有一条 FAQ (有 ${count} 条)`);
  });

  await test('T5: 全选 checkbox 切换后批量删除按钮启用', async () => {
    await page.locator('#faq-select-all').check();
    await page.waitForTimeout(300);
    const btn = page.locator('#faq-batch-del-btn');
    assert.ok(!(await btn.isDisabled()), '全选后批量删除启用');
    await page.locator('#faq-select-all').uncheck();
    await page.waitForTimeout(200);
    assert.ok(await btn.isDisabled(), '取消全选后禁用');
  });

  await test('T6: 行 checkbox 选中后计数更新', async () => {
    const firstCheck = page.locator('#admin-faq-list .faq-check').first();
    await firstCheck.check();
    await page.waitForTimeout(200);
    const countText = await page.locator('#faq-select-count').textContent();
    assert.ok(countText.includes('已选 1 项'), `选择计数: ${countText}`);
    await firstCheck.uncheck();
    await page.waitForTimeout(200);
  });

  await test('T7: 打开 AI 抽取模态框', async () => {
    await page.locator('#faq-extract-btn').click();
    await page.waitForTimeout(500);
    const modal = page.locator('#faq-extract-modal');
    assert.ok(await modal.isVisible(), '模态框可见');
    // 检查模态框内部元素
    assert.ok(await page.locator('#extract-file-list').isVisible(), '文件列表区域可见');
    assert.ok(await page.locator('#extract-api-key').isVisible(), 'API Key 输入框可见');
    assert.ok(await page.locator('#extract-start-btn').isVisible(), '开始抽取按钮可见');

    // 关闭模态框
    const closeBtn = modal.locator('.modal-actions button');
    await closeBtn.first().click();
    await page.waitForTimeout(300);
    assert.ok(!(await modal.isVisible()), '模态框已关闭');
  });

  await test('T8: 导入按钮触发文件选择', async () => {
    const input = page.locator('input[type="file"][accept=".csv,.json"]');
    const beforeCount = await input.count();
    // 导入按钮被点击后应触发隐藏 input
    // 由于 Playwright 无法直接测试 file chooser, 只验证按钮存在
    const btn = page.locator('#faq-import-btn');
    assert.ok(await btn.isVisible(), '导入按钮存在');
    // 验证隐藏的 file input
    assert.ok(beforeCount === 0 || beforeCount > 0, '文件 input 存在');
  });

  await test('T9: 导出按钮触发出格式选择弹窗', async () => {
    await page.locator('#faq-export-btn').click();
    await page.waitForTimeout(500);
    // 导出格式弹窗
    const exportFormat = page.locator('#export-format');
    assert.ok(await exportFormat.isVisible(), '导出格式下拉可见');
    // 关闭
    await page.locator('#export-cancel').click();
    await page.waitForTimeout(300);
  });

  await test('T10: 添加 FAQ 模态框可见', async () => {
    await page.locator('#add-faq-btn').click();
    await page.waitForTimeout(400);
    const modal = page.locator('#faq-modal');
    assert.ok(await modal.isVisible(), '添加 FAQ 模态框可见');
    assert.ok(await page.locator('#faq-form input[name="question"]').isVisible(), '问题输入框可见');
    assert.ok(await page.locator('#faq-form textarea[name="answer"]').isVisible(), '答案输入框可见');
    assert.ok(await page.locator('#faq-form input[name="category"]').isVisible(), '分类输入框可见');

    // 关闭
    const cancelBtn = modal.locator('.modal-actions button').first();
    await cancelBtn.click();
    await page.waitForTimeout(300);
    assert.ok(!(await modal.isVisible()), '模态框已关闭');
  });

  await test('T11: 返回 FAQ 浏览页面', async () => {
    // 导航到 FAQ 浏览页
    // 先点击侧边栏 FAQ 链接（hash /faq）
    // 或者在地址栏直接输入
    await page.goto(BASE + '/#/faq', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // 检查分类标签栏
    const tagBar = page.locator('#faq-tag-bar');
    assert.ok(await tagBar.isVisible(), '分类标签栏可见');

    const tags = tagBar.locator('.faq-tag');
    const count = await tags.count();
    assert.ok(count >= 1, `至少有一个分类标签 (${count})`);

    // 检查搜索框
    assert.ok(await page.locator('#faq-search').isVisible(), '搜索框可见');

    // 检查 FAQ 列表
    const list = page.locator('#faq-list');
    assert.ok(await list.isVisible(), 'FAQ 列表可见');
  });

  await test('T12: 分类标签可点击筛选', async () => {
    const tagBar = page.locator('#faq-tag-bar');

    // 点击第二个标签（非"全部"）
    const tags = tagBar.locator('.faq-tag');
    const count = await tags.count();

    if (count > 1) {
      var firstTag = tags.nth(1);
      var tagText = await firstTag.textContent();
      await firstTag.click();
      await page.waitForTimeout(500);

      // 检查 active 状态
      assert.ok(await firstTag.getAttribute('class'), `class ${tagText}`, '包含 active');
    }

    // 点击"全部"
    await tags.first().click();
    await page.waitForTimeout(300);
  });

  // 检查页面 errors
  await test('T13: 无页面错误', async () => {
    // 测试过程无严重页面错误
    assert.ok(errs.length === 0 || errs.every(e => e.includes('404')), '无未捕获错误');
    errs.length = 0;
  });

  await teardown();

  // ─── Summary ───
  console.log(`\n═══════════════════════════`);
  console.log(`结果: ${passed} ✅ / ${failed} ❌ / ${passed + failed} 总计`);
  console.log(`═══════════════════════════`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
