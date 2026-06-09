const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000); // 等几帧动画

  // 截全页 + 只截图canvas区域
  await page.screenshot({ path: '/tmp/kb-full.png', fullPage: true });
  
  // 截登录卡片区域
  const card = await page.locator('.login-card').screenshot({ path: '/tmp/kb-card-only.png' });
  
  console.log('Screenshots saved.');
  await browser.close();
})();
