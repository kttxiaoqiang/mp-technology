import { firefox } from 'playwright';

const b = await firefox.launch({ headless: true, args: [] });
const p = await (await b.newContext()).newPage();
const logs = [];
p.on('pageerror', e => logs.push('PAGE: ' + e.message));
p.on('console', m => { if (m.type() === 'error') logs.push('CON: ' + m.text().substring(0,150)); });

await p.goto('http://localhost:3344/', { waitUntil: 'networkidle', timeout: 15000 });
await p.waitForTimeout(1000);

// Login
await p.locator('input[name="username"]').fill('admin');
await p.locator('input[name="password"]').fill('123456');
await p.locator('button[type="submit"]').click();
await p.waitForTimeout(2000);

// Change password
await p.evaluate(() => document.getElementById('user-avatar-btn').click());
await p.waitForTimeout(300);
await p.evaluate(() => document.getElementById('change-pw-btn').click());
await p.waitForTimeout(500);

// Fill and submit
await p.evaluate(() => {
  document.getElementById('pw-old').value = '123456';
  document.getElementById('pw-new').value = '123456';
  document.getElementById('pw-confirm').value = '123456';
  document.getElementById('pw-submit-btn').click();
});

await p.waitForTimeout(2000);

// Check for toast
const result = await p.evaluate(() => {
  const toasts = document.querySelectorAll('div[style*="fixed"][style*="bottom"]');
  // or any element that looks like a toast (position fixed, bottom 24px)
  const allDivs = document.querySelectorAll('body > div');
  const toastLike = [];
  for (const d of allDivs) {
    const cs = getComputedStyle(d);
    if (cs.position === 'fixed' && parseInt(cs.bottom) > 0) {
      toastLike.push({
        text: d.textContent?.substring(0,50),
        bottom: cs.bottom,
        right: cs.right,
        background: cs.background,
        zIndex: cs.zIndex,
        opacity: cs.opacity
      });
    }
  }
  return {
    toastCount: toastLike.length,
    toasts: toastLike,
    logs: window.__logs || [],
    overlayRemoved: !document.querySelector('[id="pw-old"]'),
    errors: []
  };
});

console.log('Result:', JSON.stringify(result, null, 2));
console.log('JS ERRORS:', logs.length);
logs.forEach(l => console.log('  ❌', l));

await b.close();
