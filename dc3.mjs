import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', msg => console.log('[PAGE]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[PAGE_ERR]', err.message));

await page.goto('http://localhost:3344/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.fill('input[name="username"]', 'admin');
await page.fill('input[name="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(2000);

// 查看分类卡片数量
const cardInfo = await page.evaluate(() => {
  const grid = document.querySelector('.category-grid');
  if (!grid) return { found: false, msg: 'no .category-grid' };
  const cards = grid.querySelectorAll('.category-card');
  return {
    found: true,
    cardCount: cards.length,
    cards: Array.from(cards).map(c => ({
      text: c.textContent.trim().substring(0, 30),
      w: c.getBoundingClientRect().width,
      h: c.getBoundingClientRect().height,
      visible: c.getBoundingClientRect().width > 0
    }))
  };
});
console.log('category cards:', JSON.stringify(cardInfo, null, 2));

// 截图
await page.screenshot({ path: '/tmp/kb-cat-screenshot.png', fullPage: false });
console.log('screenshot saved');

await browser.close();
