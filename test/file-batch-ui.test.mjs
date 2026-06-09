/**
 * 文件批量管理 UI Playwright 测试
 * 测试前需确保服务器运行在 localhost:3344
 * 运行: node test/file-batch-ui.test.mjs
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3344';
const ADMIN = { username: 'admin', password: '123456' };
const USER = { username: 'test_batch_user', password: 'userpass' };

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let passed = 0, failed = 0;

  const test = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ✅ ${name}`); }
    catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
  };

  console.log('\n🧪 文件批量管理 UI 测试');
  console.log('═══════════════════════════\n');

  // ── Admin session ──
  const actx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ap = await actx.newPage();
  await ap.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await ap.fill('input[name="username"]', ADMIN.username);
  await ap.fill('input[name="password"]', ADMIN.password);
  await ap.click('button[type="submit"]');
  await ap.waitForFunction(() => !document.body.innerText.includes('请登录'), { timeout: 10000 });
  await ap.waitForTimeout(500);
  const cards = ap.locator('.category-card');
  const cardCount = await cards.count();
  if (cardCount > 0) await cards.first().click();
  await ap.waitForTimeout(800);

  await test('T1: 视图切换行有全选 checkbox', async () => {
    assert.ok(await ap.locator('#file-select-all').isVisible());
  });

  await test('T2: 批量删除按钮初始禁用', async () => {
    assert.ok(await ap.locator('#file-batch-del-btn').isDisabled());
  });

  await test('T3: 文件列表有 file-check', async () => {
    assert.ok(await ap.locator('.file-check').count() > 0);
  });

  await test('T4: 全选后批量删除启用', async () => {
    await ap.locator('#file-select-all').check();
    await ap.waitForTimeout(300);
    assert.ok(!await ap.locator('#file-batch-del-btn').isDisabled());
    // 计数变化
    const ct = await ap.locator('#file-select-count').textContent();
    assert.ok(ct && ct !== '0', `计数非0: ${ct}`);
    await ap.locator('#file-select-all').uncheck();
    await ap.waitForTimeout(200);
    assert.ok(await ap.locator('#file-batch-del-btn').isDisabled());
  });

  await test('T5: 手动勾选计数', async () => {
    await ap.locator('.file-check').first().check();
    await ap.waitForTimeout(200);
    const ct = await ap.locator('#file-select-count').textContent();
    assert.ok(ct && ct !== '0');
    await ap.locator('.file-check').first().uncheck();
    await ap.waitForTimeout(200);
  });

  await test('T6: 确认框弹窗', async () => {
    await ap.locator('.file-check').first().check();
    await ap.waitForTimeout(200);
    await ap.locator('#file-batch-del-btn').click();
    await ap.waitForTimeout(500);
    const overlay = ap.locator('.modal-overlay.show');
    assert.ok(await overlay.isVisible(), '模态框可见');
    const text = await overlay.locator('.modal-title').textContent();
    assert.ok(text.includes('确认'));
    await overlay.locator('#confirm-no').click();
    await ap.waitForTimeout(500);
    assert.equal(await ap.locator('.modal-overlay.show').count(), 0, '模态框已关');
  });

  await test('T7: 分类下拉选项', async () => {
    const opts = ap.locator('#file-batch-cat-select option');
    assert.equal(await opts.count(), 8);
  });

  await test('T8: 视图切换按钮存在', async () => {
    assert.ok(await ap.locator('.view-toggle').isVisible());
    assert.equal(await ap.locator('.view-mode').count(), 2);
  });

  await actx.close();

  // ── User session ──
  const uctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const up = await uctx.newPage();
  await up.goto(BASE + '/#/', { waitUntil: 'networkidle' });
  await up.fill('input[name="username"]', USER.username);
  await up.fill('input[name="password"]', USER.password);
  await up.click('button[type="submit"]');
  await up.waitForFunction(() => !document.body.innerText.includes('请登录'), { timeout: 10000 });
  await up.waitForTimeout(500);
  const ucards = up.locator('.category-card');
  if (await ucards.count() > 0) await ucards.first().click();
  await up.waitForTimeout(800);

  await test('T9: user 无批量组件', async () => {
    assert.equal(await up.locator('#file-select-all').count(), 0, '无全选');
    assert.equal(await up.locator('.file-check').count(), 0, '无 checkbox');
    assert.equal(await up.locator('#file-batch-del-btn').count(), 0, '无批量删除');
    assert.equal(await up.locator('#file-batch-cat-select').count(), 0, '无分类下拉');
  });

  await uctx.close();
  await browser.close();

  console.log(`\n═══════════════════════════`);
  console.log(`结果: ${passed} ✅ / ${failed} ❌ / ${passed + failed} 总计`);
  console.log(`═══════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
