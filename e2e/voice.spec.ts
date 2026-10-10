import { expect, test } from '@playwright/test';
import { linkPhone, newLearner, seedFluentCheckup, SHOTS } from './helpers';

const W = 360;
const H = 740;

// A fake microphone, so recording can be tested headless.
test.use({ launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] } });

/** Audio elements "play" instantly and record which clip they were given. */
function fakeAudio() {
  const w = window as unknown as { __played: number };
  w.__played = 0;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    w.__played++;
    setTimeout(() => this.dispatchEvent(new Event('ended')), 20);
    return Promise.resolve();
  };
}

test('a parent records the number words and the phone plays them', async ({ browser, playwright, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'records from a fake microphone; checked locally only');
  const request = await playwright.request.newContext({ baseURL });
  const learner = await newLearner(request, { range: 10, bilingual: true }, 'Voice');
  await seedFluentCheckup(request, learner.id);

  // Record one clip through the page (fake microphone), the rest through the API.
  const parentCtx = await browser.newContext({ viewport: { width: W, height: H }, storageState: await request.storageState() });
  await parentCtx.grantPermissions(['microphone']);
  const parent = await parentCtx.newPage();
  await parent.goto('/parent');
  await parent.getByText(/of 30 recorded/).click();
  await parent.getByRole('button', { name: 'Record سبعة', exact: true }).click();
  await expect(parent.getByRole('button', { name: 'Stop سبعة', exact: true })).toBeVisible();
  await expect(parent.getByText('1 of 30 recorded')).toBeVisible({ timeout: 10_000 });
  await parent.screenshot({ path: `${SHOTS}/voice-parent.png`, fullPage: true });
  const clips = [...Array.from({ length: 19 }, (_, i) => String(i + 1)), '20', '30', '40', '50', '60', '70', '80', '90', '100', 'and', 'times'];
  for (const clip of clips) {
    if (clip === '7') continue;
    const res = await request.put(`/api/audio/${clip}`, { headers: { 'content-type': 'audio/webm' }, data: Buffer.from([26, 69, 223, 163]) });
    expect(res.ok()).toBe(true);
  }

  const page = await linkPhone(browser, request, learner, { viewport: { width: W, height: H } });
  await page.addInitScript(fakeAudio);
  await page.reload();
  // Let the phone download the clips.
  await expect(page.getByText('All saved')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: "Start today's practice" }).click();
  await expect(page.locator('.question-words')).toBeVisible();
  // "a ضرب b" is at least three clips, played one after another.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __played: number }).__played)).toBeGreaterThanOrEqual(3);
});
