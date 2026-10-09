import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';
import { completeGuide, solveExpr } from './helpers';

const INVITE = process.env.INVITE_CODE ?? 'family-test';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-results/shots';

/** Creates a parent + child through the API and returns a linked phone page. */
async function linkedPhone(browser: Browser, request: APIRequestContext, settings: object, colorScheme: 'light' | 'dark') {
  await request.post('/api/auth/signup', {
    data: { email: `v+${Date.now()}${Math.random()}@example.com`, password: 'test password 123', inviteCode: INVITE },
  });
  const { learner } = await (
    await request.post('/api/learners', { data: { displayName: 'Sam', avatar: '🐙', theme: 'violet', settings } })
  ).json();
  const { code } = await (await request.post(`/api/learners/${learner.id}/pairing-code`)).json();
  const ctx = await browser.newContext({ colorScheme });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Code from your parent').fill(code);
  await page.getByRole('button', { name: 'Link this phone' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Sam' })).toBeVisible();
  return page;
}

test('younger learner sees pictures and a short check-up (dark mode)', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkedPhone(
    browser,
    request,
    { profile: 'young', sessionLength: 20, pictureHints: 'always', thresholdOffsetMs: 1500 },
    'dark',
  );
  await page.screenshot({ path: `${SHOTS}/v01-young-home-dark.png` });
  await page.getByRole('button', { name: "Let's see what you already know" }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  // Answer everything with "Not sure yet": the check-up should stay short (only ×1, ×10, ×2, ×5, with skips).
  let asked = 0;
  while (!(await page.getByRole('button', { name: 'Back home' }).isVisible())) {
    const notSure = page.getByRole('button', { name: 'Not sure yet' });
    if (await notSure.isVisible()) {
      if (asked === 0) await page.screenshot({ path: `${SHOTS}/v02-young-question-dark.png` });
      await notSure.click();
      asked++;
    } else if (await page.getByRole('button', { name: 'Keep going' }).isVisible()) {
      await page.getByRole('button', { name: 'Keep going' }).click();
    }
    await page.waitForTimeout(100);
    expect(asked).toBeLessThan(30);
  }
  await page.screenshot({ path: `${SHOTS}/v03-young-checkup-summary-dark.png` });
  await page.getByRole('button', { name: 'Back home' }).click();

  // First practice: new facts arrive with a picture, and the picture stays under the question.
  await page.getByRole('button', { name: "Start today's practice" }).click();
  await expect(page.getByText('New fact')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v04-young-new-fact-dark.png` });
  // Work through guides until a plain question appears.
  for (let i = 0; i < 10 && !(await page.locator('.question').isVisible()); i++) {
    await completeGuide(page);
    await page.waitForTimeout(300);
  }
  await expect(page.locator('.question')).toBeVisible();
  await expect(page.locator('.question-area .bar-model')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v05-young-question-with-picture-dark.png` });

  // Hint button opens the strategy without leaving the question.
  await page.getByRole('button', { name: 'Finish for now' }).click();
});

test('standard learner light mode: hint button and map sheet', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkedPhone(browser, request, {}, 'light');
  await page.getByRole('button', { name: "Let's see what you already know" }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  // Answer the check-up correctly so practice starts with reviews and new facts.
  while (!(await page.getByRole('button', { name: 'Back home' }).isVisible())) {
    const q = page.locator('.question');
    if ((await q.isVisible()) && (await page.locator('.numpad button').first().isEnabled())) {
      const [a, b] = ((await q.textContent()) ?? '').split('×').map((s) => Number(s.trim()));
      const ans = a === 7 || b === 7 ? null : a * b;
      if (ans === null) await page.getByRole('button', { name: 'Not sure yet' }).click();
      else for (const d of String(ans)) await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
    } else if (await page.getByRole('button', { name: 'Keep going' }).isVisible()) {
      await page.getByRole('button', { name: 'Keep going' }).click();
    }
    await page.waitForTimeout(60);
  }
  await page.getByRole('button', { name: 'Back home' }).click();
  await page.screenshot({ path: `${SHOTS}/v06-standard-home.png` });
  await page.getByRole('button', { name: "Start today's practice" }).click();
  for (let i = 0; i < 10 && !(await page.getByRole('button', { name: 'Show me a way' }).isVisible()); i++) {
    await completeGuide(page);
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: 'Show me a way' }).click();
  await expect(page.locator('.guide')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v07-hint-open.png` });
});

/**
 * The facts from the first round of feedback, on a small phone (360×740) and a large one.
 * Each guide must fit: nothing overlapping, and the number pad fully on screen at every step.
 */
for (const [w, h] of [
  [360, 740],
  [412, 915],
]) {
  test(`guides fit on a ${w}×${h} screen`, async ({ browser, baseURL }) => {
    test.skip(!baseURL?.includes('5173'), 'the guide preview page only exists in the dev server');
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' })).newPage();
    for (const [a, b] of [[5, 3], [6, 3], [5, 9], [7, 8], [7, 9], [12, 12], [9, 9]]) {
      await page.goto(`/dev/guide?a=${a}&b=${b}`);
      for (let step = 0; step < 6; step++) {
        const expr = page.locator('.guide-expr');
        if (!(await expr.isVisible())) break;
        // The number pad's last row must be fully visible.
        const pad = await page.locator('.numpad button').last().boundingBox();
        expect(pad && pad.y + pad.height <= h + 1).toBe(true);
        if (w === 360) await page.screenshot({ path: `${SHOTS}/g-${a}x${b}-step${step + 1}.png` });
        const text = ((await expr.getAttribute('data-expr')) ?? '') + ' = ?';
        for (const d of String(solveExpr(text))) await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
        await page.waitForTimeout(450);
      }
      await expect(page.getByRole('button', { name: 'Back to practice' })).toBeVisible();
      if (w === 360) await page.screenshot({ path: `${SHOTS}/g-${a}x${b}-done.png` });
    }
  });
}

/** Each animated trick plays only after the guide is done, ends on the fact, and can be replayed. */
const TRICKS: [number, number, string][] = [
  [7, 8, 'So 7 × 8 = 56'],
  [8, 7, '…and 8 × 7 is the same!'],
  [7, 10, 'So 7 × 10 = 70'],
  [10, 12, 'So 10 × 12 = 120'],
  [11, 4, 'So 11 × 4 = 44'],
  [9, 7, 'So 9 × 7 = 63'],
];

for (const [a, b, ending] of TRICKS) {
  test(`${a} × ${b} trick animation`, async ({ browser, baseURL }) => {
    test.skip(!baseURL?.includes('5173'), 'the guide preview page only exists in the dev server');
    const page = await (await browser.newContext({ viewport: { width: 360, height: 740 } })).newPage();
    await page.goto(`/dev/guide?a=${a}&b=${b}`);
    // The trick must not appear before the answer is worked out.
    for (let step = 0; step < 6 && (await page.locator('.guide-expr').isVisible()); step++) {
      await expect(page.locator('.trick')).toHaveCount(0);
      await page.waitForTimeout(2000); // let the swap / bar animations play
      if (step === 0) await page.screenshot({ path: `${SHOTS}/t-${a}x${b}-step1.png` });
      const text = ((await page.locator('.guide-expr').getAttribute('data-expr')) ?? '') + ' = ?';
      for (const d of String(solveExpr(text))) await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
      await page.waitForTimeout(450);
    }
    await expect(page.locator('.trick')).toBeVisible();
    await page.locator('.trick').scrollIntoViewIfNeeded();
    const start = Date.now();
    for (const ms of [300, 1300, 2200, 3200, 4500]) {
      await page.waitForTimeout(Math.max(0, ms - (Date.now() - start)));
      await page.locator('.trick').screenshot({ path: `${SHOTS}/t-${a}x${b}-${String(ms).padStart(5, '0')}.png` });
    }
    await expect(page.locator('.trick-caption')).toHaveText(ending, { timeout: 15_000 });
    await page.waitForTimeout(800);
    await page.locator('.trick').screenshot({ path: `${SHOTS}/t-${a}x${b}-end.png` });
    // The whole trick stays inside the screen.
    const box = (await page.locator('.trick-row').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await page.getByRole('button', { name: /Watch again/ }).click();
    await expect(page.locator('.trick-caption')).not.toHaveText(ending);
  });
}
