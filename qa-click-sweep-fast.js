const { chromium } = require('playwright');

(async () => {
  const base = 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(2200);

  page.on('filechooser', async (fc) => {
    try { await fc.setFiles([]); } catch {}
  });

  const runtimeErrors = [];
  const checks = [];
  page.on('pageerror', (err) => runtimeErrors.push({ url: page.url(), message: String(err?.message || err) }));

  const skipText = /upload|choose file|log out/i;

  async function scan(route) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const elems = page.locator('a[href], button, [role="button"]');
    const n = Math.min(await elems.count(), 90);

    for (let i = 0; i < n; i++) {
      const el = elems.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;

      const text = ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 120) || '(no-text)';
      if (skipText.test(text)) continue;

      const tag = await el.evaluate(n => n.tagName).catch(() => '?');
      const href = (await el.getAttribute('href').catch(() => '')) || '';
      const beforeErr = runtimeErrors.length;
      const beforeUrl = page.url();
      let status = 'pass';
      let note = '';

      try {
        await el.click({ timeout: 1600 });
        await page.waitForTimeout(260);
      } catch (e) {
        status = 'fail';
        note = `click failed`;
      }

      const newErr = runtimeErrors.slice(beforeErr);
      if (newErr.length && status === 'pass') {
        status = 'fail';
        note = `runtime: ${newErr[0].message}`;
      }

      checks.push({ route, control: `${tag}:${text}`, href, status, note });

      if (page.url() !== beforeUrl) {
        await page.goBack({ timeout: 2600 }).catch(() => {});
        await page.waitForTimeout(260);
      }
    }
  }

  await scan('/');
  await scan('/login');

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', 'ava@circlenest.dev').catch(()=>{});
  await page.fill('input[name="password"]', 'CircleNest!2026Secure').catch(()=>{});
  await page.click('button:has-text("Enter CircleNest")').catch(()=>{});
  await page.waitForTimeout(900);

  if (page.url().includes('/login')) {
    checks.push({ route:'/login', control:'BUTTON:Enter CircleNest', href:'', status:'fail', note:'login failed' });
  } else {
    checks.push({ route:'/login', control:'BUTTON:Enter CircleNest', href:'', status:'pass', note:'' });
    for (const r of ['/home','/profile/edit','/friends','/groups','/messages','/notifications','/settings','/settings/theme']) {
      await scan(r);
    }
  }

  await browser.close();
  const fails = checks.filter(c => c.status === 'fail');
  console.log(JSON.stringify({ tested: checks.length, failCount: fails.length, failItems: fails.slice(0, 200) }, null, 2));
})();
