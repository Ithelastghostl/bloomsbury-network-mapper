import { chromium } from 'playwright';

const shots = [
  { url: 'http://localhost:3000/', out: '/tmp/shot-home.png' },
  { url: 'http://localhost:3000/crm', out: '/tmp/shot-crm.png' },
  { url: 'http://localhost:3000/crm/decide', out: '/tmp/shot-decide.png' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const { url, out } of shots) {
  const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch((e) => ({ status: () => `ERR ${e.message}` }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`${url} -> ${typeof resp.status === 'function' ? resp.status() : resp.status} -> ${out}`);
}
await browser.close();
