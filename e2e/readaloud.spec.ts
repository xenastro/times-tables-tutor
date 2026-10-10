import { expect, test, type Page } from '@playwright/test';
import { linkPhone, newLearner, SHOTS } from './helpers';

/** A pretend speech engine that records what it was asked to say. */
function fakeSpeech(withVoice: boolean) {
  const w = window as unknown as { __spoken: string[] };
  w.__spoken = [];
  const voices = withVoice ? [{ lang: 'en-GB', name: 'Test voice', localService: true, default: true, voiceURI: 'test' }] : [];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak: (u: { text: string; onend?: () => void }) => {
        w.__spoken.push(u.text);
        setTimeout(() => u.onend?.(), 50);
      },
      cancel: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = function (this: { text: string }, text: string) {
    this.text = text;
  };
}

/** Removes speech support completely, like a browser without it. */
function noSpeech() {
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
}

const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test('a younger learner hears each question, and can hear it again', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkPhone(browser, request, await newLearner(request, { profile: 'young' }), {
    viewport: { width: 360, height: 740 },
  });
  await page.addInitScript(fakeSpeech, true);
  await page.reload();
  await page.goto('/practice'); // skip the Understand lessons
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  // The first check-up question is 1 × 4.
  await expect.poll(() => spoken(page)).toContain('1 times 4');
  await page.screenshot({ path: `${SHOTS}/ra-question.png` });
  await page.getByRole('button', { name: 'Say it again' }).click();
  await expect.poll(async () => (await spoken(page)).filter((s) => s === '1 times 4').length).toBe(2);
  // Answering moves on, and the next question is read too.
  for (const d of '4') await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(3);
});

test('read-aloud is off by default for the standard profile', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkPhone(browser, request, await newLearner(request, {}));
  await page.addInitScript(fakeSpeech, true);
  await page.reload();
  await page.getByRole('button', { name: "Let's see what you already know" }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.question')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await spoken(page)).toEqual([]);
  await expect(page.getByRole('button', { name: 'Say it again' })).toHaveCount(0);
});

test('with no voice on the phone, read-aloud quietly does nothing', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkPhone(browser, request, await newLearner(request, { profile: 'young' }));
  await page.addInitScript(noSpeech);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.reload();
  await page.goto('/practice'); // skip the Understand lessons
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.question')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Say it again' })).toHaveCount(0);
  for (const d of '4') await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
  await expect(page.locator('.question')).toBeVisible();
  expect(errors).toEqual([]);
});
