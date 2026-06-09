// Category Cards — 分类卡片功能端到端测试
const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3344';

test.describe('Category Cards UI', () => {
  // Helper: login via API and set storage state so page uses the same cookie
  async function login(page) {
    // Navigate to login page and submit the form
    await page.goto(BASE + '/#/login');
    await page.waitForSelector('#login-form');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'admin123');
    await page.click('button[type="submit"]');
    // Wait for SPA to redirect to home
    await page.waitForTimeout(1500);
  }

  test('首页展示分类卡片而非文件列表', async ({ page }) => {
    await login(page);
    // After login we should be at /#/ with category cards
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const catCards = page.locator('.category-card');
    expect(await catCards.count()).toBeGreaterThanOrEqual(1);

    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#search-btn')).toBeVisible();
    // Category tabs should not appear at the home level
    await expect(page.locator('#category-tabs')).not.toBeVisible();
  });

  test('分类卡片展示正确信息', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const cards = page.locator('.category-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(7);

    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      await expect(card.locator('.category-card-name')).toBeVisible();
      await expect(card.locator('.category-card-count')).toBeVisible();
    }

    const texts = await cards.allTextContents();
    const allText = texts.join(' ');
    expect(allText).toContain('方案');
    expect(allText).toContain('报告');
    expect(allText).toContain('密评FAQ');
  });

  test('点击分类卡片进入文件列表', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const cards = page.locator('.category-card');
    for (let i = 0; i < await cards.count(); i++) {
      const text = await cards.nth(i).textContent();
      if (text.includes('方案')) {
        await cards.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(500);

    await expect(page.locator('#file-list')).toBeVisible();
    await expect(page.locator('.category-header')).toContainText('方案');
    await expect(page.locator('#file-list')).toContainText('连云港密码方案', { timeout: 3000 });
  });

  test('分类文件列表有预览和下载功能', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const cards = page.locator('.category-card');
    for (let i = 0; i < await cards.count(); i++) {
      if ((await cards.nth(i).textContent()).includes('方案')) {
        await cards.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(500);

    const downloads = page.locator('#file-list a[download]');
    expect(await downloads.count()).toBeGreaterThanOrEqual(1);

    const href = await downloads.first().getAttribute('href');
    expect(href).toMatch(/^\/api\/download/);
  });

  test('搜索功能保持正常工作', async ({ page }) => {
    await login(page);
    await page.waitForSelector('#search-input', { timeout: 5000 });

    await page.fill('#search-input', 'SM3');
    await page.click('#search-btn');
    await page.waitForTimeout(1000);

    const contentArea = page.locator('#content-area');
    await expect(contentArea).toContainText('SM3', { timeout: 3000 });

    // Clear search: back to categories
    await page.fill('#search-input', '');
    await page.click('#search-btn');
    await page.waitForTimeout(500);

    await expect(page.locator('.category-card').first()).toBeVisible();
  });

  test('文件列表视图切换在分类内页工作', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const cards = page.locator('.category-card');
    for (let i = 0; i < await cards.count(); i++) {
      if ((await cards.nth(i).textContent()).includes('密评FAQ')) {
        await cards.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(500);

    await expect(page.locator('#view-toggle')).toBeVisible();
  });

  test('顶级「全部」显示所有文件', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card', { timeout: 5000 });

    const cards = page.locator('.category-card');
    for (let i = 0; i < await cards.count(); i++) {
      if ((await cards.nth(i).textContent()).includes('全部')) {
        await cards.nth(i).click();
        break;
      }
    }
    await page.waitForTimeout(500);

    await expect(page.locator('#file-list')).toBeVisible();
    expect(await page.locator('#file-list > *').count()).toBeGreaterThanOrEqual(1);
  });
});
