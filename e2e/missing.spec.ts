import { expect, test, type Page } from '@playwright/test';
import { completeGuide, linkPhone, newLearner, padReady, readQuestion, seedFluentCheckup, SHOTS, solveExpr, tapNumber } from './helpers';

const W = 360;
const H = 740;

/** Nothing pokes out of the screen, and the number pad's last row is fully visible. */
async function expectFits(page: Page, selector: string) {
  const box = (await page.locator(selector).first().boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(W + 1);
  const pad = page.locator('.numpad button').last();
  if (await pad.isVisible()) {
    const p = (await pad.boundingBox())!;
    expect(p.y + p.height).toBeLessThanOrEqual(H + 1);
  }
}

/** Works through the guide on screen, taking a picture of each step. Never types the hidden number early. */
async function workThroughGuide(page: Page, prefix: string) {
  for (let step = 0; step < 6 && (await page.locator('.guide-expr').isVisible()); step++) {
    // The heading shows the puzzle (or nothing yet), never the solved fact.
    await expect(page.locator('.guide-fact')).not.toHaveText(/\d+ × \d+ = \d+/);
    await expect(page.locator('.trick')).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expectFits(page, '.guide-expr');
    await page.screenshot({ path: `${SHOTS}/${prefix}-step${step + 1}.png` });
    const text = ((await page.locator('.guide-expr').getAttribute('data-expr')) ?? '') + ' = ?';
    await tapNumber(page, solveExpr(text));
    await page.waitForTimeout(500);
  }
  // Only now does the short play, ending on the division.
  await expect(page.locator('.trick')).toBeVisible();
  await expect(page.locator('.trick-caption')).toContainText("That's division!", { timeout: 30_000 });
  await expect(page.getByRole('button', { name: /Watch again/ })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await expectFits(page, '.trick-row');
  await page.screenshot({ path: `${SHOTS}/${prefix}-done.png` });
}

test('missing-number puzzles: introduced once, mixed into practice, worked out together after a slip', async ({
  browser,
  playwright,
  baseURL,
}) => {
  const request = await playwright.request.newContext({ baseURL });
  // 10×10 only, so a fully fluent map doesn't unlock the bonus rows (which would bring new facts).
  const learner = await newLearner(request, { range: 10 }, 'Puzzle');
  await seedFluentCheckup(request, learner.id);
  const page = await linkPhone(browser, request, learner, { viewport: { width: W, height: H } });
  await page.getByRole('button', { name: "Start today's practice" }).click();

  let introDone = false;
  let slipDone = false;
  for (let guard = 0; guard < 120 && !(introDone && slipDone); guard++) {
    await page.waitForTimeout(80);
    if (await page.getByText('A new kind of puzzle', { exact: true }).isVisible()) {
      expect(introDone).toBe(false);
      await workThroughGuide(page, 'mn-intro');
      await page.getByRole('button', { name: 'Back to practice' }).click();
      introDone = true;
      continue;
    }
    if (await page.locator('.guide').isVisible()) {
      await completeGuide(page);
      continue;
    }
    // e.g. the turnaround tip
    if (await page.getByRole('button', { name: 'Got it' }).isVisible()) {
      await page.getByRole('button', { name: 'Got it' }).click();
      continue;
    }
    if ((await page.locator('.question').isVisible()) && (await padReady(page))) {
      const q = await readQuestion(page);
      if (q.missing) {
        expect(introDone).toBe(true);
        await expectFits(page, '.question');
        await page.screenshot({ path: `${SHOTS}/mn-question.png` });
        // No picture under a missing-number question: it would give the answer away.
        await expect(page.locator('.question-area .bar-model')).toHaveCount(0);
        if (!slipDone) {
          const wrong = q.expected - 1;
          await tapNumber(page, wrong);
          if (String(wrong).length < String(q.expected).length) await page.getByRole('button', { name: 'Check' }).click();
          await expect(page.getByText("Let's work it out together")).toBeVisible();
          await workThroughGuide(page, 'mn-slip');
          await page.getByRole('button', { name: 'Got it' }).click();
          slipDone = true;
          continue;
        }
      }
      await tapNumber(page, q.expected);
    }
  }
  expect(introDone).toBe(true);
  expect(slipDone).toBe(true);
  await page.getByRole('button', { name: 'Finish for now' }).click();
  await expect(page.getByRole('heading', { name: 'Session done' })).toBeVisible();
});

test('missing-number guides fit a small screen for the biggest numbers', async ({ browser, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'the guide preview page only exists in the dev server');
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' })).newPage();
  for (const [a, b, missing, intro] of [
    [12, 12, 'b', ''],
    [8, 7, 'a', ''],
    [3, 9, 'a', ''],
    [7, 12, 'b', '1'],
  ] as const) {
    await page.goto(`/dev/guide?a=${a}&b=${b}&missing=${missing}&intro=${intro}`);
    await workThroughGuide(page, `mn-g-${a}x${b}${missing}${intro ? '-intro' : ''}`);
  }
});
