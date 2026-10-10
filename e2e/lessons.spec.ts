import { expect, test, type Page } from '@playwright/test';
import { linkPhone, newLearner, SHOTS, solveExpr, tapNumber } from './helpers';

const W = 360;
const H = 740;

async function answerOf(page: Page): Promise<number> {
  const expr = (await page.locator('.guide-expr').getAttribute('data-expr')) ?? '';
  const m = expr.match(/^count (\d+)$/);
  return m ? Number(m[1]) : solveExpr(expr + ' = ?');
}

async function expectFits(page: Page) {
  for (const sel of ['.guide-step', '.numpad']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(W + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(H + 1);
  }
}

test('a younger learner works through the Understand lessons before the check-up', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const page = await linkPhone(browser, request, await newLearner(request, { profile: 'young' }, 'Little'), {
    viewport: { width: W, height: H },
    colorScheme: 'dark',
  });
  await page.screenshot({ path: `${SHOTS}/ls-home-start.png` });
  await page.getByRole('button', { name: 'Lesson: Equal groups' }).click();

  const titles = ['Equal groups', 'Rows', 'Counting in 10s', 'Counting in 2s', 'Counting in 5s'];
  for (const [li, title] of titles.entries()) {
    await expect(page.locator('.guide-head .kicker')).toHaveText(title);
    for (let step = 0; step < 8 && (await page.locator('.guide-expr').isVisible()); step++) {
      await page.waitForTimeout(2800); // let the picture's half-speed animation finish
      await expectFits(page);
      await page.screenshot({ path: `${SHOTS}/ls-${li + 1}-step${step + 1}.png` });
      const ans = await answerOf(page);
      if (li === 0 && step === 0) {
        // A first slip asks to count again; a second shows the number to type.
        await tapNumber(page, ans + 1);
        await expect(page.getByText('Not quite. Count them again. You can do it!')).toBeVisible();
        await tapNumber(page, ans + 1);
        await expect(page.getByText(`Type ${ans} to keep going`, { exact: false })).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/ls-1-slip.png` });
      }
      await tapNumber(page, ans);
      await page.waitForTimeout(600);
      if (await page.getByText('Lesson done!').isVisible()) break;
    }
    await expect(page.getByRole('heading', { name: 'Lesson done!' })).toBeVisible();
    if (li < titles.length - 1) await page.getByRole('button', { name: `Next: ${titles[li + 1]}` }).click();
  }
  // The path is finished: next comes the check-up.
  await expect(page.getByRole('button', { name: "Let's see what you already know" })).toBeVisible();
  await page.getByRole('button', { name: 'Back home' }).click();
  await expect(page.getByRole('button', { name: "Let's see what you already know" })).toBeVisible();
  await expect(page.locator('.lesson-path .chip.done')).toHaveCount(5);
  await page.screenshot({ path: `${SHOTS}/ls-home-done.png`, fullPage: true });
});
