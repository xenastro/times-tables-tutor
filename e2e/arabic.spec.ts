import { expect, test } from './quiet';
import type { Page } from '@playwright/test';
import { completeGuide, linkPhone, newLearner, padReady, readQuestion, seedFluentCheckup, SHOTS, tapNumber } from './helpers';

const W = 360;
const H = 740;

/** A pretend speech engine with an Arabic voice that records what it says. */
function fakeArabicSpeech() {
  const w = window as unknown as { __spoken: { text: string; lang: string }[] };
  w.__spoken = [];
  const voices = [
    { lang: 'ar-SA', name: 'Arabic', localService: true, default: false, voiceURI: 'ar' },
    { lang: 'en-GB', name: 'English', localService: true, default: true, voiceURI: 'en' },
  ];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => voices,
      speak: (u: { text: string; lang: string; onend?: () => void }) => {
        w.__spoken.push({ text: u.text, lang: u.lang });
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

/** Records which Arabic clips the app plays. */
function recordClips() {
  const w = window as unknown as { __clips: string[] };
  w.__clips = [];
  window.addEventListener('app:arabic-say', (e) => w.__clips.push(...(e as CustomEvent<string[]>).detail));
}

const EASTERN = /[٠-٩]/;

/** Answers whatever practice shows, correctly, until `until` is true (or a guard runs out). */
async function practiseUntil(page: Page, until: () => Promise<boolean>, max = 60) {
  for (let i = 0; i < max; i++) {
    await page.waitForTimeout(100);
    if (await until()) return;
    if (await page.locator('.guide').isVisible()) {
      await completeGuide(page);
      continue;
    }
    // The turnaround tip: its main button moves on.
    if (await page.locator('.panel .turnaround').isVisible()) {
      await page.locator('.panel .btn-primary').click();
      continue;
    }
    if ((await page.locator('.question').isVisible()) && (await padReady(page))) {
      await tapNumber(page, (await readQuestion(page)).expected);
    }
  }
}

test('Arabic interface with ٠١٢٣ digits, right to left', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const learner = await newLearner(request, { range: 10, language: 'ar', numerals: 'eastern' }, 'Huda');
  await seedFluentCheckup(request, learner.id);
  const page = await (async () => {
    const { code } = await (await request.post(`/api/learners/${learner.id}/pairing-code`)).json();
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' });
    const p = await ctx.newPage();
    await p.goto('/');
    await p.getByRole('button', { name: 'I already use Ashra on another phone' }).click();
    await p.getByLabel('Code').fill(code);
    await p.getByRole('button', { name: 'Carry on' }).click();
    await expect(p.getByRole('heading', { name: 'مرحبًا يا Huda' })).toBeVisible();
    return p;
  })();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.stat .value').first()).toHaveText(/٥٥/);
  await page.screenshot({ path: `${SHOTS}/ar-home.png`, fullPage: true });

  await page.getByRole('button', { name: 'ابدأ تمرين اليوم' }).click();
  await expect(page.locator('.question')).toBeVisible();
  await expect(page.locator('.question')).toHaveText(EASTERN);
  await expect(page.locator('.numpad button').first()).toHaveText('١');
  await page.screenshot({ path: `${SHOTS}/ar-question.png` });
  await tapNumber(page, (await readQuestion(page)).expected);
  await expect(page.locator('.answer-box')).toHaveText(EASTERN);

  // A hint opens the guide in Arabic, sums still left to right.
  await practiseUntil(page, () => page.getByRole('button', { name: 'أرني طريقة' }).isVisible());
  await page.getByRole('button', { name: 'أرني طريقة' }).click();
  await expect(page.locator('.guide-expr')).toHaveAttribute('dir', 'ltr');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/ar-guide.png` });
  const box = (await page.locator('.guide-step').boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(W + 1);
  await completeGuide(page);
  await page.getByRole('button', { name: 'إنهاء الآن' }).click();
  await page.getByRole('button', { name: 'العودة إلى البداية' }).click();

  // The map, and the units-first reading of an answer.
  await page.getByRole('button', { name: 'اعرض خريطتك' }).last().click();
  await page.screenshot({ path: `${SHOTS}/ar-map.png` });
  await page.locator('.factmap button').nth(6 * 10 + 7).click(); // 7 × 8
  await page.getByRole('button', { name: /قُلها بالعربية/ }).click();
  await expect(page.locator('.words-row')).toHaveText(/ستة\s*وخمسون/);
  await expect(page.locator('.trick-caption').last()).toHaveText(/٥٦/, { timeout: 20_000 });
  await page.screenshot({ path: `${SHOTS}/ar-words.png` });
});

test('bilingual mode: the question in Arabic words, the answer in digits', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const learner = await newLearner(request, { range: 10, bilingual: true }, 'Sami');
  await seedFluentCheckup(request, learner.id);
  const page = await linkPhone(browser, request, learner, { viewport: { width: W, height: H } });
  await page.addInitScript(fakeArabicSpeech);
  await page.addInitScript(recordClips);
  await page.reload();
  await page.getByRole('button', { name: "Start today's practice" }).click();
  await expect(page.locator('.question-words')).toBeVisible();
  const q = await readQuestion(page);
  await expect(page.locator('.question-words')).toContainText('ضرب');
  await page.screenshot({ path: `${SHOTS}/bi-question.png` });
  // Heard in Arabic from the recorded clip that ships with the app, never the phone's own voice.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __clips: string[] }).__clips)).toContain(`t${q.a}x${q.b}`);
  expect(await page.evaluate(() => (window as unknown as { __spoken: unknown[] }).__spoken)).toEqual([]);
  const clip = await request.get(`/voice/ar/amal1/t${q.a}x${q.b}.mp3`);
  expect(clip.status()).toBe(200);
  expect(clip.headers()['content-type']).toContain('audio/mpeg');
  await tapNumber(page, q.expected);
  await expect(page.locator('.answer-words')).not.toHaveText('');
  await page.screenshot({ path: `${SHOTS}/bi-answer.png` });

  // Soon, the first answer with a units digit shows how Arabic says numbers.
  await practiseUntil(page, () => page.locator('.words-show').isVisible(), 300);
  await expect(page.locator('.words-show')).toBeVisible();
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${SHOTS}/bi-words-tip.png` });
  await page.getByRole('button', { name: 'Got it' }).click();
  // Practice carries on: the next question, or (some sessions) the missing-number puzzle's introduction.
  await expect(page.locator('.question, .guide-expr').first()).toBeVisible();
});

test('the units-first short lines words up with digits', async ({ browser, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'the preview page only exists in the dev server');
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' })).newPage();
  for (const n of [56, 144, 15]) {
    await page.goto(`/dev/words?n=${n}&lang=ar&digits=eastern`);
    for (const ms of [500, 3500, 6500, 10_000]) {
      await page.waitForTimeout(ms === 500 ? 500 : 3000);
      await page.locator('.words-show').screenshot({ path: `${SHOTS}/w-${n}-${ms}.png` });
    }
    await expect(page.getByRole('button', { name: /شاهد مرة أخرى/ })).toBeVisible({ timeout: 10_000 });
    const box = (await page.locator('.words-show').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(W + 1);
  }
});

test('parent area in Arabic', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const learner = await newLearner(request, {}, 'Lina');
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, storageState: await request.storageState() });
  const page = await ctx.newPage();
  await page.goto('/parent');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.getByRole('heading', { name: 'منطقة الوالدين' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: `${SHOTS}/ar-parent-home.png`, fullPage: true });
  await page.goto(`/parent/child/${learner.id}`);
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ar-parent-child.png`, fullPage: true });
  // Back to English.
  await page.goto('/parent');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();
});
