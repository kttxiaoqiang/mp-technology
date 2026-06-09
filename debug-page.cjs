const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(500);

  // dump page state
  const html = await page.content();
  console.log('=== PAGE HTML (first 2000 chars) ===');
  console.log(html.substring(0, 2000));

  const inputs = await page.$$('input');
  console.log('\n=== INPUTS ===');
  for (const inp of inputs) {
    const type = await inp.getAttribute('type');
    const placeholder = await inp.getAttribute('placeholder');
    const id = await inp.getAttribute('id');
    const name = await inp.getAttribute('name');
    console.log({ type, placeholder, id, name });
  }

  const buttons = await page.$$('button');
  console.log('\n=== BUTTONS ===');
  for (const btn of buttons) {
    const text = await btn.textContent();
    console.log('  button:', JSON.stringify(text.trim()));
  }

  await browser.close();
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
