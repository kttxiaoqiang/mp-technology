const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', msg => console.log('[CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[PAGE_ERROR]', err.message));

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.login-page', { timeout: 10000 });
  await page.waitForTimeout(5000);

  await page.screenshot({ path: '/tmp/kb-login-debug.png', fullPage: true });

  const info = await page.evaluate(() => {
    const el = document.getElementById('login-three-bg');
    return {
      elExists: !!el,
      childCount: el ? el.children.length : -1,
      datasetLoaded: el ? el.dataset.threeLoaded : 'no-el',
      innerHTML: el ? el.innerHTML.substring(0, 200) : 'no-el'
    };
  });
  console.log('Three info:', JSON.stringify(info, null, 2));

  await browser.close();
})();
