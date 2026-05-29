const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = 'http://localhost:3001';
const EMAIL = 'mike@dearmon.net';
const PASSWORD = 'XZE1dme9ugf@wrz.rqe';
const CAMERA = 'C:/Users/MikeDeArmon/OneDrive - Compass Managed IT, Inc/Pictures/Camera Roll';
const BUGS_PATH = path.join(process.cwd(), 'Bugs');
const QA_LOG = path.join(process.cwd(), 'qa-run-log.json');

function appendBug(lines){
  fs.appendFileSync(BUGS_PATH, lines.join('\n') + '\n\n');
}

(async () => {
  const bugLines = [];
  fs.writeFileSync(BUGS_PATH, `# Bugs\nGenerated: ${new Date().toISOString()}\n\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1720, height: 980 } });
  const page = await context.newPage();

  const events = [];
  page.on('pageerror', (e) => {
    events.push({ type: 'pageerror', msg: e.message });
  });
  page.on('console', (m) => {
    if (m.type() === 'error') events.push({ type: 'console', msg: m.text() });
  });
  page.on('response', (r) => {
    if (r.status() >= 400) events.push({ type: 'http', status: r.status(), url: r.url() });
  });

  const imgFiles = fs.readdirSync(CAMERA)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f))
    .slice(0, 3)
    .map(f => path.join(CAMERA, f));

  // Login
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="identifier"]', EMAIL).catch(()=>{});
  await page.fill('input[name="login"]', EMAIL).catch(()=>{});
  await page.fill('input[name="password"]', PASSWORD).catch(()=>{});
  // Support possible different selectors
  const emailInput = page.locator('input[name="identifier"], input[type="email"], input[placeholder*="example" i], input[name="email"]').first();
  if (await emailInput.count()) {
    try { await emailInput.fill(EMAIL); } catch {}
  }
  const passInput = page.locator('input[type="password"]').first();
  if (await passInput.count()) {
    try { await passInput.fill(PASSWORD); } catch {}
  }
  const submit = page.getByRole('button', { name: /submit|log in|login|sign in/i }).first();
  if (await submit.count()) {
    await Promise.all([page.waitForLoadState('networkidle').catch(()=>{}), submit.click()]);
  } else {
    const loginLink = page.getByRole('link', { name: /log in|login/i }).first();
    if (await loginLink.count()) {
      await loginLink.click();
      await page.fill('input[type="email"], input[name="login"]', EMAIL).catch(()=>{});
      await page.fill('input[type="password"]', PASSWORD).catch(()=>{});
      const b2 = page.getByRole('button', { name: /submit|log in|sign in/i }).first();
      if (await b2.count()) await Promise.all([page.waitForLoadState('networkidle').catch(()=>{}), b2.click()]);
    }
  }

  // If 2FA page appears, record as pending manual step
  if ((await page.url()).includes('/login/2fa')) {
    bugLines.push('- [INFO] Reached 2FA gate during automated QA; requires manual email code input to continue this account session.');
  }

  // Navigate to home if possible
  if (!(await page.url()).includes('/home')) {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
  }
  if (!(await page.url()).includes('/home')) {
    bugLines.push('- [BUG] Could not establish authenticated session for QA user on /home.');
  }

  // Open communicate and post text
  const communicateBtn = page.getByRole('button', { name: /communicate!?/i }).first();
  if (await communicateBtn.count()) {
    await communicateBtn.click().catch(()=>{});
    const editor = page.locator('#communicate-editor');
    await editor.first().waitFor({ state: 'visible', timeout: 2500 }).catch(()=>{});
    let editorReady = await editor.count();
    if (!editorReady) {
      await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
      await page.waitForTimeout(500);
      const retryBtn = page.getByRole('button', { name: /communicate!?/i }).first();
      if (await retryBtn.count()) {
        await retryBtn.click().catch(()=>{});
        await editor.first().waitFor({ state: 'visible', timeout: 2500 }).catch(()=>{});
        editorReady = await editor.count();
      }
    }
    if (editorReady) {
      await editor.fill('Automated QA text post ' + Date.now());
      await page.locator('input[type="radio"][value="ALL"]').click().catch(()=>{});
      await page.getByRole('button', { name: /^Post$/i }).click().catch(()=>{});
      await page.waitForTimeout(1500);
      if (await page.getByText(/Invalid post|Could not post/i).count()) {
        bugLines.push('- [BUG] Communicate text post failed with invalid/could-not-post message despite valid input.');
      }
    } else {
      bugLines.push('- [BUG] Communicate button does not open composer editor.');
    }
  } else {
    bugLines.push('- [BUG] Communicate button not found on home stream.');
  }

  // Post with image
  if (await page.locator('#communicate-editor').count()) {
    const editor = page.locator('#communicate-editor');
    await editor.fill('Automated QA image post ' + Date.now());
    const uploadInput = page.locator('#postImage');
    if (await uploadInput.count() && imgFiles.length) {
      await uploadInput.setInputFiles(imgFiles[0]).catch(()=>{});
      await page.locator('input[type="radio"][value="ALL"]').click().catch(()=>{});
      await page.getByRole('button', { name: /^Post$/i }).click().catch(()=>{});
      await page.waitForTimeout(2000);
      if (await page.getByText(/Invalid post|Could not post/i).count()) {
        bugLines.push('- [BUG] Communicate image post fails after upload selection.');
      }
    } else {
      bugLines.push('- [BUG] Post image input not found in communicate composer.');
    }
  }

  // Gallery checks + upload
  await page.goto(`${BASE}/profile/gallery`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
  const galleryUpload = page.locator('#gallery-upload-input');
  if (await galleryUpload.count() && imgFiles.length >= 2) {
    await galleryUpload.setInputFiles([imgFiles[0], imgFiles[1]]).catch(()=>{});
    await page.waitForTimeout(2500);
    const noPhotos = await page.getByText(/No photos yet/i).count();
    if (noPhotos) {
      bugLines.push('- [BUG] Gallery upload accepted file selection but photos did not appear.');
    }
  } else {
    bugLines.push('- [BUG] Gallery upload input not found or no source images available.');
  }

  // Click visible nav links/pages
  const navNames = ['My Stream','Friends','Gallery','Messages','Groups','Notifications','Invites','Profile','Theme','Security','My Rules','My Subscription'];
  for (const name of navNames) {
    const l = page.getByRole('link', { name: new RegExp(`^${name}$`, 'i') }).first();
    if (await l.count()) {
      try {
        await Promise.all([page.waitForLoadState('domcontentloaded'), l.click()]);
        await page.waitForTimeout(500);
      } catch (e) {
        bugLines.push(`- [BUG] Navigation link "${name}" click produced failure: ${String(e.message || e)}`);
      }
    }
  }

  // Generic button sweep on current page
  const buttons = page.locator('button');
  const bCount = await buttons.count();
  for (let i=0; i<Math.min(bCount, 40); i++) {
    const b = buttons.nth(i);
    const text = (await b.innerText().catch(()=>''))?.trim()?.slice(0,60);
    if (!text) continue;
    if (/log out/i.test(text)) continue;
    try {
      await b.click({ timeout: 1200 });
      await page.waitForTimeout(120);
    } catch {}
  }

  // Create second account quick smoke
  await context.clearCookies();
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' }).catch(()=>{});
  const uname = `qauser${Date.now().toString().slice(-6)}`;
  const email = `${uname}@example.com`;
  const pwd = 'XZE1dme9ugf@wrz.rqe';
  try {
    await page.fill('input[name="fullName"]', 'QA User');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="phoneNumber"]', '5551234567');
    await page.fill('input[name="username"]', uname);
    await page.fill('input[name="password"]', pwd);
    await page.fill('input[name="confirmPassword"]', pwd);
    await page.fill('input[name="city"]', 'LA');
    await page.fill('input[name="state"]', 'CA');
    await page.fill('input[name="country"]', 'USA');
    // choose ranked interests (5 required)
    const rankedInterests = ['Technology', 'Science', 'Business', 'Family', 'Spirituality'];
    for (let i = 1; i <= 5; i++) {
      await page.selectOption(`select[name="interest${i}"]`, rankedInterests[i - 1]).catch(()=>{});
    }
    await page.getByRole('button', { name: /create|sign up|submit/i }).first().click().catch(()=>{});
    await page.waitForTimeout(1800);
    if ((await page.url()).includes('/signup')) {
      bugLines.push('- [BUG] Signup flow for secondary user did not complete (stayed on signup).');
    }
  } catch (e) {
    bugLines.push(`- [BUG] Signup automation failure for secondary user: ${String(e.message || e)}`);
  }

  // Collate runtime events
  const dedup = new Set();
  for (const ev of events) {
    if (ev.type === 'http' && ev.status === 404 && /webpack\.hot-update\.json/.test(ev.url)) continue;
    if (ev.type === 'http' && ev.status === 401 && /\/api\/groups$/.test(ev.url)) continue;
    if (ev.type === 'console' && /Failed to load resource: the server responded with a status of (404|401)/.test(ev.msg)) continue;
    const line = ev.type === 'http'
      ? `- [RUNTIME] HTTP ${ev.status} ${ev.url}`
      : `- [RUNTIME] ${ev.type}: ${ev.msg}`;
    if (!dedup.has(line)) {
      dedup.add(line);
      if (/\.map$/.test(line)) continue;
      bugLines.push(line);
    }
  }

  if (bugLines.length === 0) bugLines.push('- No reproducible bugs found in this automated pass.');
  appendBug(bugLines);
  fs.writeFileSync(QA_LOG, JSON.stringify({ at: new Date().toISOString(), bugCount: bugLines.length, bugs: bugLines }, null, 2));

  await browser.close();
  console.log(`QA complete. Logged ${bugLines.length} entries.`);
})();
