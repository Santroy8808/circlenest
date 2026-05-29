const { chromium } = require('playwright');

(async () => {
  const base = 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  const errs = [];
  page.on('pageerror', e => errs.push({ url: page.url(), msg: String(e.message || e) }));

  async function safeClick(sel) {
    const loc = page.locator(sel).first();
    await loc.click({ timeout: 2500 });
  }

  async function check(label, fn) {
    const before = errs.length;
    let status = 'pass';
    let note = '';
    try {
      await fn();
      await page.waitForTimeout(250);
    } catch (e) {
      status = 'fail';
      note = String(e.message || e).split('\n')[0];
    }
    if (errs.length > before) {
      status = 'fail';
      note = errs[errs.length - 1].msg;
    }
    console.log('STEP', label, status);
    return { label, status, note, url: page.url() };
  }

  const results = [];

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', 'ava@circlenest.dev');
  await page.fill('input[name="password"]', 'CircleNest!2026Secure');
  results.push(await check('Login submit', async () => safeClick('button:has-text("Enter CircleNest")')));
  await page.waitForTimeout(1000);

  if (page.url().includes('/login')) {
    console.log(JSON.stringify({ tested: results.length, failCount: 1, results }, null, 2));
    await browser.close();
    return;
  }

  const navChecks = [
    ['Quick: Gallery', 'a:has-text("Gallery")', '/profile/edit'],
    ['Quick: Messages', 'a:has-text("Messages")', '/messages'],
    ['Quick: Groups', 'a:has-text("Groups")', '/groups'],
    ['Quick: Friends', 'a:has-text("Friends")', '/friends'],
    ['Header: Communicate', 'a:has-text("Communicate")', '/home'],
    ['Section: Settings', 'a:has-text("Settings")', '/settings'],
    ['Section: Theme', 'a:has-text("Theme")', '/settings/theme'],
  ];

  for (const [label, sel, expected] of navChecks) {
    await page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
    const row = await check(label, async () => safeClick(sel));
    if (!page.url().includes(expected)) {
      row.status = 'fail';
      row.note = `expected ${expected}, got ${page.url()}`;
    }
    results.push(row);
  }

  await page.goto(base + '/home', { waitUntil: 'domcontentloaded' });
  results.push(await check('Stream Type select', async () => page.locator('select').first().selectOption('FRIENDS_FIRST')));
  results.push(await check('Communicate toggle', async () => safeClick('button:has-text("Communicate")')));

  const fails = results.filter(r => r.status === 'fail');
  console.log(JSON.stringify({ tested: results.length, failCount: fails.length, fails, results }, null, 2));
  await browser.close();
})();
