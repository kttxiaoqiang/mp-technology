const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.login-page', { timeout: 10000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/tmp/kb-login-page.png', fullPage: true });

  const hasCanvas = await page.evaluate(() => {
    const el = document.getElementById('login-three-bg');
    return el ? el.querySelector('canvas') !== null : 'no-el';
  });
  console.log('Has Three.js canvas:', hasCanvas);

  await browser.close();
})();
