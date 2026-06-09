const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('pageerror', err => console.log('[PAGE_ERR]', err.message));

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(4000);

  const threeInfo = await page.evaluate(() => {
    const el = document.getElementById('login-three-bg');
    return {
      hasCanvas: !!el?.querySelector('canvas'),
      childCount: el?.children.length || 0,
      datasetLoaded: el?.dataset.threeLoaded
    };
  });
  console.log('Three info:', JSON.stringify(threeInfo));

  await page.screenshot({ path: '/home/zhang/.openclaw/workspace/kb-login-v2.png', fullPage: true });
  console.log('done');
  await browser.close();
})();
