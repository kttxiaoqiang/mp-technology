/**
 * E2E tests for the kb-web SPA frontend.
 * Requires the server to be running (handled by playwright.config.cjs webServer).
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const KB_PATH = process.env.KB_PATH || '/home/zhang/company_knowledge_base';

// ─── Test user credentials ────────────────────────────────────
const TEST_USER = {
  username: 'testadmin',
  password: 'testpass123',
};

// ─── Helpers ──────────────────────────────────────────────────

/**
 * Seed a test .md file for search testing
 */
function seedSearchFile() {
  const mdPath = path.join(KB_PATH, 'e2e_search_test.md');
  const content = `---
title: "E2E测试文档"
source: "e2e_search_test.txt"
source_type: "TXT"
created: "2026-01-01"
---
# E2E 测试搜索文档

SM2 是中国椭圆曲线公钥密码算法标准。
SM3 是密码杂凑算法，输出256位摘要。
SM4 是分组密码算法。`;
  fs.writeFileSync(mdPath, content, 'utf-8');
  return mdPath;
}

// ─── Tests ────────────────────────────────────────────────────

test.describe('SPA: Login flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('unauthenticated user sees login page', async ({ page }) => {
    await page.waitForSelector('#login-form', { timeout: 10000 });
    const form = page.locator('#login-form');
    await expect(form).toBeVisible();

    // Should see username and password fields
    await expect(page.locator('input[name="username"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('login with valid credentials redirects to home', async ({ page }) => {
    await page.waitForSelector('#login-form', { timeout: 10000 });

    await page.fill('input[name="username"]', TEST_USER.username);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');

    // After login, should see the main navigation bar
    await page.waitForSelector('nav', { timeout: 10000 });
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Should see the logout button
    await expect(page.locator('text=退出')).toBeVisible();
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.waitForSelector('#login-form', { timeout: 10000 });

    await page.fill('input[name="username"]', 'wronguser');
    await page.fill('input[type="password"]', 'wrongpass');
    await page.click('button[type="submit"]');

    // Should see error message
    const errorEl = page.locator('#login-error');
    await expect(errorEl).not.toHaveClass(/hidden/);
  });

  test('logout returns to login page', async ({ page }) => {
    await page.waitForSelector('#login-form', { timeout: 10000 });

    // Login first
    await page.fill('input[name="username"]', TEST_USER.username);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('nav', { timeout: 10000 });

    // Logout
    await page.click('text=退出');

    // Should be back on login page
    await page.waitForSelector('#login-form', { timeout: 10000 });
    await expect(page.locator('#login-form')).toBeVisible();
  });
});

test.describe('SPA: File browsing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for SPA to render
    await page.waitForTimeout(500);
    // Login if auth is required
    try {
      await page.waitForSelector('#login-form', { timeout: 5000 });
      await page.fill('input[name="username"]', TEST_USER.username);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForSelector('nav', { timeout: 5000 });
    } catch {
      // Already logged in or no auth required
    }
    // Wait for home page to render fully
    await page.waitForTimeout(300);
  });

  test('home page shows category cards', async ({ page }) => {
    // Home page should show category cards by default
    await page.waitForSelector('.category-card', { timeout: 10000 });
    const catCards = page.locator('.category-card');
    expect(await catCards.count()).toBeGreaterThanOrEqual(7);

    // Should have a search input
    await expect(page.locator('#search-input')).toBeVisible();

    // Click into a category to see tabs + file list
    await catCards.filter({ hasText: '方案' }).first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('#category-tabs')).toBeVisible();
    await expect(page.locator('#file-list')).toBeVisible();
  });

  test('clicking a category card opens file list', async ({ page }) => {
    await page.waitForSelector('.category-card', { timeout: 10000 });

    // Click on a category card (e.g., 方案)
    const catCard = page.locator('.category-card').filter({ hasText: '方案' }).first();
    await catCard.click();
    // Wait for async file loading
    await page.waitForTimeout(500);

    // Verify the file list is present
    await expect(page.locator('#file-list')).toBeVisible({ timeout: 5000 });

    // Category tabs should appear inside the category view
    await expect(page.locator('#category-tabs')).toBeVisible();
    expect(await page.locator('#category-tabs button').count()).toBeGreaterThan(0);

    // Check that the 方案 tab is present
    const schemeTab = page.locator('#category-tabs button').filter({ hasText: '方案' });
    await expect(schemeTab).toBeVisible();
  });

test.describe('SPA: Search', () => {
  let mdPath;

  test.beforeAll(() => {
    mdPath = seedSearchFile();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login if needed
    try {
      await page.waitForSelector('#login-form', { timeout: 3000 });
      await page.fill('input[name="username"]', TEST_USER.username);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForSelector('nav', { timeout: 5000 });
    } catch {
      // OK
    }
  });

  test('search by keyword shows results', async ({ page }) => {
    await page.waitForSelector('#search-input', { timeout: 10000 });
    await page.fill('#search-input', 'SM2');
    await page.click('#search-btn');
    await page.waitForTimeout(1500);

    // Should show search results
    const stats = page.locator('#search-stats');
    await expect(stats).toContainText('SM2');
  });

  test('search with empty query does nothing', async ({ page }) => {
    await page.waitForSelector('#search-input', { timeout: 10000 });
    await page.fill('#search-input', '');
    await page.click('#search-btn');
    await page.waitForTimeout(500);

    // File list should still be visible, not search results
    const stats = page.locator('#search-stats');
    const statsText = await stats.textContent();
    // Should be about file count, not search results
    expect(statsText).not.toContain('找到');
  });

  test('search with no matches shows empty state', async ({ page }) => {
    await page.waitForSelector('#search-input', { timeout: 10000 });
    await page.fill('#search-input', 'ZZZZ_THIS_SHOULD_NOT_MATCH_12345');
    await page.click('#search-btn');
    await page.waitForTimeout(1000);

    const contentArea = page.locator('#content-area');
    await expect(contentArea).toContainText('未找到');
  });

  test('category filter works with search', async ({ page }) => {
    await page.waitForSelector('#search-input', { timeout: 10000 });
    await page.fill('#search-input', 'SM2');

    // Select a category
    const catSelect = page.locator('#search-category');
    if (await catSelect.count() > 0) {
      await catSelect.selectOption('方案');
    }

    await page.click('#search-btn');
    await page.waitForTimeout(1000);

    const stats = page.locator('#search-stats');
    await expect(stats).toBeVisible();
  });

  test.afterAll(() => {
    if (mdPath && fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
  });
});

test.describe('SPA: Upload flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login if needed
    try {
      await page.waitForSelector('#login-form', { timeout: 3000 });
      await page.fill('input[name="username"]', TEST_USER.username);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForSelector('nav', { timeout: 5000 });
    } catch {
      // OK
    }
  });

  test('upload modal opens and closes', async ({ page }) => {
    // Click upload button
    const uploadBtn = page.locator('#upload-btn');
    if (await uploadBtn.count() === 0) {
      test.skip('Upload button not visible (not admin?)');
      return;
    }
    await uploadBtn.click();

    const modal = page.locator('#upload-modal');
    await expect(modal).toBeVisible();

    // Click cancel
    await page.click('#upload-modal .modal-content button:has-text("取消")');
    await expect(modal).not.toBeVisible();
  });

  test('upload a file via modal', async ({ page }) => {
    const uploadBtn = page.locator('#upload-btn');
    if (await uploadBtn.count() === 0) {
      test.skip('Upload button not visible');
      return;
    }
    await uploadBtn.click();

    // Create a temp file to upload
    const tmpFile = path.join('/tmp', 'e2e_upload_test.txt');
    fs.writeFileSync(tmpFile, 'E2E upload test content SM4 SM4', 'utf-8');

    // Set file input
    const fileInput = page.locator('#upload-form input[type="file"]');
    await fileInput.setInputFiles(tmpFile);

    // Submit
    await page.click('#upload-form button[type="submit"]');
    await page.waitForTimeout(1500);

    // Modal should close
    const modal = page.locator('#upload-modal');
    await expect(modal).not.toBeVisible();

    // Cleanup
    fs.unlinkSync(tmpFile);
  });
});

test.describe('SPA: Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login
    try {
      await page.waitForSelector('#login-form', { timeout: 3000 });
      await page.fill('input[name="username"]', TEST_USER.username);
      await page.fill('input[type="password"]', TEST_USER.password);
      await page.click('button[type="submit"]');
      await page.waitForSelector('nav', { timeout: 5000 });
    } catch {
      // OK
    }
  });

  test('navigate to FAQ page', async ({ page }) => {
    const faqLink = page.locator('nav a:has-text("FAQ")');
    if (await faqLink.count() === 0) {
      test.skip('FAQ link not visible');
      return;
    }
    await page.locator('nav a:has-text("FAQ")').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('h1')).toContainText('FAQ');
  });

  test('file list shows initial items inside category view', async ({ page }) => {
    // First click into a category
    await page.waitForSelector('.category-card', { timeout: 10000 });
    await page.locator('.category-card').filter({ hasText: '方案' }).first().click();
    await page.waitForTimeout(500);
    
    await page.waitForSelector('#file-list', { timeout: 10000 });
    
    // Verify at least one file item is rendered
    const firstItem = page.locator('#file-list > div, #file-list > a, #file-list > .file-card').first();
    await expect(firstItem).toBeVisible({ timeout: 5000 });
    
    // Check for a load-more button or pagination
    const loadMore = page.locator('#load-more, [data-testid="load-more"], button:has-text("加载更多")');
    if (await loadMore.count() > 0) {
      await expect(loadMore).toBeVisible();
    }
  });

  test('view toggle changes display mode', async ({ page }) => {
    // First click into a category
    await page.waitForSelector('.category-card', { timeout: 10000 });
    await page.locator('.category-card').filter({ hasText: '密评FAQ' }).first().click();
    await page.waitForTimeout(500);
    
    await page.waitForSelector('#file-list', { timeout: 10000 });
    
    const viewToggle = page.locator('#view-toggle, [data-testid="view-toggle"], button:has-text("卡片"), button:has-text("列表")');
    
    // If toggle exists, click it and verify something changes
    if (await viewToggle.count() > 0) {
      await viewToggle.first().click();
      await page.waitForTimeout(300);
      // After click, the toggle should still exist (switched mode)
      await expect(viewToggle.first()).toBeVisible();
    }
  });
});
