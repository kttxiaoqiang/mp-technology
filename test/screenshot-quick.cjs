const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  await page.screenshot({ path: '/home/zhang/.openclaw/workspace/kb-login-thumb.png', fullPage: true });
  console.log('done');
  await browser.close();
})();
