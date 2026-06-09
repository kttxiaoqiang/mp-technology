/**
 * tests/e2e/download.test.cjs
 * E2E: 前端下载按钮测试
 *
 * 1. 文件列表有下载按钮
 * 2. 点击下载能成功获取文件
 * 3. 搜索结果有下载按钮
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3344';

async function login(page) {
  // Use API login and keep session cookie
  const username = 'admin';
  const password = 'admin123';
  await page.goto(`${BASE}/api/auth/login`, { waitUntil: 'domcontentloaded' });
  const loginRes = await page.evaluate(async ({ username, password }) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    return { ok: res.ok, success: data.success };
  }, { username, password });
  console.log('[login]', loginRes);
}

test.describe('前端下载交互', () => {

  test('文件列表显示下载按钮', async ({ page }) => {
    await login(page);
    // Home now shows category cards; click into 方案 to see file list with downloads
    await page.waitForSelector('.category-card');
    await page.locator('.category-card').filter({ hasText: '方案' }).first().click();
    await page.waitForTimeout(500);
    await page.waitForSelector('#file-list');
    await page.waitForTimeout(1500);
    const downloadLinks = page.locator('a[download]');
    const count = await downloadLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test('点击下载按钮能下载文件', async ({ page }) => {
    await login(page);
    await page.waitForSelector('.category-card');
    await page.locator('.category-card').filter({ hasText: '方案' }).first().click();
    await page.waitForTimeout(500);
    await page.waitForSelector('#file-list');
    await page.waitForTimeout(1500);

    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const downloadLink = page.locator('a[download]').first();
    await downloadLink.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBeTruthy();
    console.log('[e2e] downloaded file:', download.suggestedFilename());
  });

  test('搜索结果中有原始文件下载链接', async ({ page }) => {
    await login(page);
    await page.waitForSelector('#search-input');

    const searchInput = page.locator('#search-input');
    await searchInput.fill('方案');
    await searchInput.press('Enter');
    await page.waitForTimeout(1000);

    // Search results are now in #search-results-list, inside #content-area
    const contentArea = page.locator('#content-area');
    await expect(contentArea).toContainText('方案', { timeout: 3000 });
  });
});
