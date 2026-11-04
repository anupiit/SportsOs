/**
 * Interactive browser checks: role switcher, permission matrix, roles drawer, import preview, organisation page.
 *   node test/ui-flows.e2e.cjs   (mutates the DB: assigns a TEST role, creates an import preview)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.env.SHOT_DIR || require('os').tmpdir();
const WEB = process.env.WEB_URL || 'http://localhost:3000';
let fails = 0;
const ok = (c, l) => { console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); if (!c) fails++; };
async function session(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept(page.nextPrompt ?? ''));
  await page.goto(WEB + '/login');
  await page.fill('#email', email);
  await page.fill('#password', 'sportsos123');
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard');
  await page.waitForTimeout(1200);
  return { ctx, page };
}
(async () => {
  const browser = await chromium.launch();
  // 1. role switcher narrows permissions server-side
  {
    const { ctx, page } = await session(browser, 'media@sportsos.demo');
    const greet = await page.locator('h1').innerText();
    ok(!greet.includes('[DEMO]'), `greeting has no [DEMO] prefix: "${greet}"`);
    await page.goto(WEB + '/events');
    await page.waitForTimeout(1000);
    ok(await page.getByRole('button', { name: 'New tournament' }).count() === 1, 'media+event committee sees New tournament');
    await page.selectOption('select[aria-label="Active role"]', 'MEDIA_NOMINEE');
    await page.waitForTimeout(1500);
    ok(await page.getByRole('button', { name: 'New tournament' }).count() === 0, 'acting as media only hides New tournament');
    await page.screenshot({ path: `${OUT}/switch_media.png` });
    await page.reload();
    await page.waitForTimeout(1500);
    ok((await page.locator('select[aria-label="Active role"]').inputValue()) === 'MEDIA_NOMINEE', 'active role persists across reload');
    ok(page.errors.length === 0, 'no page errors ' + page.errors.join('|'));
    await ctx.close();
  }
  // 2. admin matrix + roles drawer
  {
    const { ctx, page } = await session(browser, 'admin@sportsos.demo');
    await page.goto(WEB + '/admin/roles');
    await page.getByRole('tab', { name: 'Permission matrix' }).click();
    await page.waitForTimeout(1500);
    ok(await page.locator('table button[aria-label^="Grant"], table button[aria-label^="Remove"]').count() > 500, 'matrix renders role × permission cells');
    await page.screenshot({ path: `${OUT}/admin_matrix.png` });
    await page.goto(WEB + '/admin/users');
    await page.waitForTimeout(1200);
    await page.getByPlaceholder('Search name, email or admission no.').fill('Demo Student 05');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Roles' }).first().click();
    await page.waitForTimeout(1200);
    await page.selectOption('#as-role', 'EVENT_COMMITTEE');
    await page.fill('#as-reason', 'UI test: temporary volunteer');
    await page.getByRole('button', { name: 'Assign role' }).click();
    await page.waitForTimeout(1500);
    ok(await page.getByText('Event Committee').count() > 0, 'role assigned from the drawer appears in history');
    await page.screenshot({ path: `${OUT}/admin_roles_drawer.png` });
    // 3. institutional import preview
    const csv = require('path').join(require('os').tmpdir(), 'sportsos-test-import.csv');
    fs.writeFileSync(csv, 'name,designation,source_url,verified_on,status\nTEST UI Person,TEST Officer,https://example.org/test,2026-11-01,VERIFIED\nTEST Bad Row,TEST Officer,,,VERIFIED\n');
    await page.goto(WEB + '/admin/institution');
    await page.waitForTimeout(1000);
    await page.setInputFiles('#im-file', csv);
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.waitForTimeout(1500);
    ok(await page.getByText('1 new').count() > 0 && await page.getByText('1 errors').count() > 0, 'import preview shows 1 new / 1 error');
    await page.screenshot({ path: `${OUT}/admin_import_preview.png` });
    ok(page.errors.length === 0, 'no page errors ' + page.errors.join('|'));
    await ctx.close();
  }
  // 4. complaint lifecycle via UI: student raises; student cannot manage
  {
    const { ctx, page } = await session(browser, 'student@sportsos.demo');
    await page.goto(WEB + '/complaints');
    await page.waitForTimeout(1000);
    ok(await page.getByRole('button', { name: 'Manage' }).count() === 0, 'student has no Manage buttons');
    await page.goto(WEB + '/organisation');
    await page.waitForTimeout(1500);
    ok(await page.getByText('Live matrix').count() > 0, 'organisation page shows live matrix badge');
    await page.screenshot({ path: `${OUT}/student_org.png` });
    ok(page.errors.length === 0, 'no page errors ' + page.errors.join('|'));
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL(S)` : 'all interactive checks passed');
})();
