/**
 * Browser checks (Playwright) against a running web app + API on a freshly seeded DEMO database.
 *   node test/ui-roles.e2e.cjs   — per-role navigation and pages render without errors / failed API calls
 * Env: WEB_URL (default http://localhost:3000), SHOT_DIR (screenshots, default OS temp dir).
 */
const { chromium } = require('playwright');
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
const WEB = process.env.WEB_URL || 'http://localhost:3000';
const cases = [
  { email: 'student@sportsos.demo', pages: ['/dashboard', '/facilities', '/announcements', '/directory', '/organisation'], expectNav: ['Facilities', 'Bookings'], denyNav: ['Analytics', 'Users', 'Roles & permissions', 'Institutional data', 'Tasks'] },
  { email: 'peso@sportsos.demo', pages: ['/dashboard', '/bookings', '/inventory', '/complaints', '/tasks', '/admin/users', '/admin/institution'], expectNav: ['Analytics', 'Users', 'Roles & permissions', 'Institutional data', 'Tasks'], denyNav: [] },
  { email: 'dean.sw@sportsos.demo', pages: ['/dashboard', '/admin/roles'], expectNav: ['Analytics', 'Roles & permissions'], denyNav: ['Institutional data', 'Tasks'] },
  { email: 'admin@sportsos.demo', pages: ['/dashboard', '/admin/roles', '/admin/users'], expectNav: ['Roles & permissions', 'Users', 'Institutional data', 'Audit ledger'], denyNav: ['Analytics', 'Tasks'] },
  { email: 'coach.football@sportsos.demo', pages: ['/dashboard', '/attendance', '/clubs'], expectNav: ['Attendance', 'Clubs'], denyNav: ['Users', 'Analytics'] },
  { email: 'ground@sportsos.demo', pages: ['/dashboard', '/tasks'], expectNav: ['Tasks'], denyNav: ['Analytics', 'Users'] },
  { email: 'security@sportsos.demo', pages: ['/dashboard', '/bookings'], expectNav: ['Bookings'], denyNav: ['Analytics', 'Tasks', 'Users'] },
  { email: 'media@sportsos.demo', pages: ['/dashboard', '/announcements', '/events'], expectNav: ['Announcements'], denyNav: ['Analytics', 'Users'] },
  { email: 'hostelsec.a@sportsos.demo', pages: ['/dashboard', '/events'], expectNav: ['Tournaments'], denyNav: ['Analytics', 'Users'] },
];
(async () => {
  const browser = await chromium.launch();
  let problems = 0;
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
    page.on('response', (r) => { if (r.url().includes(':4000/api') && r.status() >= 400 && r.status() !== 401) errors.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().replace('http://localhost:4000/api', '')}`); });
    await page.goto(WEB + '/login');
    await page.fill('#email', c.email);
    await page.fill('#password', 'sportsos123');
    await page.click('button[type=submit]');
    await page.waitForURL('**/dashboard', { timeout: 15000 });
    await page.waitForTimeout(1500);
    const nav = await page.locator('nav[aria-label="Main navigation"] a').allInnerTexts();
    const missing = c.expectNav.filter((n) => !nav.includes(n));
    const leaked = c.denyNav.filter((n) => nav.includes(n));
    for (const p of c.pages) {
      await page.goto(WEB + p);
      await page.waitForTimeout(1800);
      const tag = c.email.split('@')[0] + p.replace(/\//g, '_');
      await page.screenshot({ path: `${OUT}/${tag}.png`, fullPage: false });
    }
    const bad = missing.length || leaked.length || errors.length;
    if (bad) problems++;
    console.log(`${bad ? 'FAIL' : 'PASS'} ${c.email}  nav=[${nav.join(', ')}]${missing.length ? ' MISSING ' + missing : ''}${leaked.length ? ' LEAKED ' + leaked : ''}`);
    errors.slice(0, 8).forEach((e) => console.log('   ', e.slice(0, 200)));
    await ctx.close();
  }
  await browser.close();
  console.log(problems ? `${problems} problem(s)` : 'all UI role checks passed');
})();
