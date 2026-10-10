import { expect, test } from './quiet';

const SHOTS = process.env.SHOTS_DIR ?? 'e2e-results/shots';

test('parent fact details open as a centred dialog that fits a laptop screen', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 800 }, isMobile: false, hasTouch: false });
  const page = await ctx.newPage();
  await page.goto(baseURL + '/parent');
  await page.request.post('/api/auth/signup', {
    data: { email: `d+${Date.now()}@example.com`, password: 'test password 123' },
  });
  const { learner } = await (await page.request.post('/api/learners', { data: { displayName: 'Desk', settings: {} } })).json();
  await page.goto(`/parent/child/${learner.id}`);
  await page.locator('.factmap button').nth(8 * 10 + 6).click();
  const sheet = page.locator('.sheet');
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(500); // let the dialog's rise animation finish
  const box = (await sheet.boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(800);
  await page.screenshot({ path: `${SHOTS}/d01-desktop-dialog.png` });
});
