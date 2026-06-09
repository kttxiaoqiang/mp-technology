import { firefox } from 'playwright';

(async () => {
  const b = await firefox.launch({ headless: false, args: ['--new-instance'] });
  const ctx = await b.newContext();
  const p = await ctx.newPage();

  // Capture errors
  const errs = [];
  p.on('pageerror', e => errs.push('PAGE: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().substring(0, 150)); });

  await p.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
  await p.waitForTimeout(1500);
  console.log('1) loaded, errors:', errs.length);

  await p.locator('input[name="username"]').fill('admin');
  await p.locator('input[name="password"]').fill('123456');
  await p.locator('button[type="submit"]').click();
  await p.waitForTimeout(2000);
  console.log('2) login done');

  // Click avatar, then click change password
  await p.locator('#user-avatar-btn').click();
  await p.waitForTimeout(400);
  console.log('3) dropdown opened');

  await p.locator('#change-pw-btn').click();
  await p.waitForTimeout(800);
  console.log('4) clicked change pw');

  const modal = await p.evaluate(() => ({
    pwOld: !!document.querySelector('#pw-old'),
    err: document.querySelector('#pw-error')?.textContent || '',
    overlays: document.querySelectorAll('.modal-overlay').length,
    errorEl: (() => {
      const e = document.getElementById('pw-error');
      return e ? e.textContent + '|' + e.style.display : 'NONE';
    })()
  }));
  console.log('5) modal state:', JSON.stringify(modal, null, 2));
  console.log('6) errors:', errs.length);
  errs.forEach(e => console.log('   ', e));

  // Wait for manual inspection (30 seconds)
  console.log('\nWaiting 30s for you to see the Firefox window...');
  await p.waitForTimeout(30000);

  await b.close();
})().catch(e => {
  console.error('FATAL:', e.message, e.stack?.substring(0, 300));
  process.exit(1);
});
