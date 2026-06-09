const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(500);

  // Fill login form
  // username is a text input (type=null but works with name selector)
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', '123456');

  // Click login button
  await page.click('button:has-text("进 入 知 识 库")');
  await page.waitForTimeout(2000);

  // Wait for main page to load
  await page.waitForLoadState('networkidle').catch(() => {});

  await page.screenshot({ path: '/tmp/kb-after-login.png', fullPage: false });
  console.log('Screenshot saved');

  // Show current state
  console.log('URL:', page.url());
  const h1 = await page.$('h1').then(el => el ? el.textContent() : 'no h1').catch(() => 'err');
  console.log('H1:', h1);

  // Visible text summary
  const text = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log('=== Visible text ===');
  console.log(text);

  await browser.close();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
