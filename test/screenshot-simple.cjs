const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[ERR]', msg.text());
  });
  page.on('pageerror', err => console.log('[PAGE_ERR]', err.message));

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  
  // 直接截当前页面不管是什么
  await page.screenshot({ path: '/tmp/kb-login-now.png', fullPage: true });

  const url = page.url();
  const bodyHTML = await page.evaluate(() => document.body.innerHTML.substring(0, 500));
  console.log('URL:', url);
  console.log('Body start:', bodyHTML);

  // Three.js canvas 检查
  const threeInfo = await page.evaluate(() => {
    const el = document.getElementById('login-three-bg');
    if (!el) return { found: false, reason: 'no element' };
    return {
      found: true,
      hasCanvas: !!el.querySelector('canvas'),
      childCount: el.children.length,
      datasetLoaded: el.dataset.threeLoaded
    };
  });
  console.log('Three info:', JSON.stringify(threeInfo));

  await browser.close();
})();
