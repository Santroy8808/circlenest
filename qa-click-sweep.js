const { chromium } = require('playwright');

(async () => {
  const base = 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const runtimeErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (err) => runtimeErrors.push({ url: page.url(), message: String(err?.message || err) }));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push({ url: page.url(), message: msg.text() });
  });

  const checks = [];

  async function clickVisibleControls(route) {
    await page.goto(base + route, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const locator = page.locator('a[href], button');
    const count = await locator.count();

    for (let i = 0; i < count; i++) {
      const el = locator.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;

      const text = ((await el.innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 80) || '(no-text)';
      const tag = (await el.evaluate((n) => n.tagName).catch(() => '?'));
      const href = (await el.getAttribute('href').catch(() => null)) || '';
      if (/log out/i.test(text)) continue;

      const beforeErrCount = runtimeErrors.length;
      const beforeConsoleErrCount = consoleErrors.length;
      const beforeUrl = page.url();

      let status = 'pass';
      let note = '';

      try {
        if (tag === 'A') {
          await Promise.all([
            page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {}),
            el.click({ timeout: 3000 })
          ]);
        } else {
          await el.click({ timeout: 3000 });
          await page.waitForTimeout(400);
        }

        const newErr = runtimeErrors.slice(beforeErrCount);
        const newConsole = consoleErrors.slice(beforeConsoleErrCount).filter(e => /TypeError|Unhandled Runtime Error|Cannot read properties|Invariant|Minified React error/i.test(e.message));

        if (newErr.length > 0) {
          status = 'fail';
          note = `pageerror: ${newErr[0].message}`;
        } else if (newConsole.length > 0) {
          status = 'fail';
          note = `console: ${newConsole[0].message}`;
        }
      } catch (e) {
        status = 'fail';
        note = `click exception: ${String(e.message || e)}`;
      }

      checks.push({ route, control: `${tag}:${text}`, href, status, note });

      if (page.url() !== beforeUrl) {
        await page.goBack({ timeout: 5000 }).catch(() => {});
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  // Public routes
  await clickVisibleControls('/');
  await clickVisibleControls('/login');

  // Login with seeded strong password
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', 'ava@circlenest.dev');
  await page.fill('input[name="password"]', 'CircleNest!2026Secure');
  await page.click('button:has-text("Enter CircleNest")');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);

  if (page.url().includes('/login')) {
    checks.push({ route: '/login', control: 'BUTTON:Enter CircleNest', href: '', status: 'fail', note: 'login failed or blocked' });
  } else {
    checks.push({ route: '/login', control: 'BUTTON:Enter CircleNest', href: '', status: 'pass', note: '' });

    const authedRoutes = ['/home', '/profile/edit', '/friends', '/groups', '/messages', '/notifications', '/settings', '/settings/theme'];
    for (const r of authedRoutes) {
      await clickVisibleControls(r);
    }
  }

  await browser.close();

  const fails = checks.filter(c => c.status === 'fail');
  console.log(JSON.stringify({
    testedControls: checks.length,
    failCount: fails.length,
    fails,
    runtimeErrorCount: runtimeErrors.length,
    consoleErrorCount: consoleErrors.length
  }, null, 2));
})();
