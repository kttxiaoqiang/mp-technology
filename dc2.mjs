import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => console.log('[PAGE]', msg.type(), msg.text()));
page.on('pageerror', err => console.log('[PAGE_ERROR]', err.message));

await page.goto('http://localhost:3344/', { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

await page.fill('input[name="username"]', 'admin');
await page.fill('input[name="password"]', '123456');
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);

// 截图
await page.screenshot({ path: '/tmp/kb-screenshot.png', fullPage: false });
console.log('screenshot saved');

// 检查 ECharts 容器的实际数量
const chartCount = await page.evaluate(() => {
  const ids = ['chart-cat-bar', 'chart-trend-line', 'chart-type-donut', 'chart-search-bar'];
  return ids.map(id => {
    const el = document.getElementById(id);
    if (!el) return { id, found: false };
    const rect = el.getBoundingClientRect();
    const inst = window.echarts ? echarts.getInstanceByDom(el) : null;
    return { id, found: true, w: rect.width, h: rect.height, visible: rect.width > 0 && rect.height > 0, hasChart: !!inst };
  });
});
console.log('chart containers:', JSON.stringify(chartCount, null, 2));

// 看图表网格 DOM
const gridHtml = await page.evaluate(() => {
  const grid = document.querySelector('.chart-grid-2x2');
  if (!grid) return 'null';
  return grid.innerHTML.substring(0, 800);
});
console.log('grid html:', gridHtml);

await browser.close();
