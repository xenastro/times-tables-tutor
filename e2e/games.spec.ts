import { expect, test, type Page } from '@playwright/test';
import { completeGuide, linkPhone, newLearner, padReady, seedFluentCheckup, SHOTS, tapNumber } from './helpers';

const W = 360;
const H = 740;

async function expectInsideScreen(page: Page, selector: string) {
  const box = (await page.locator(selector).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(W + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(H + 1);
}

test('games: find the pairs, and fill a row', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const learner = await newLearner(request, { range: 10 }, 'Player');
  await seedFluentCheckup(request, learner.id);
  const page = await linkPhone(browser, request, learner, { viewport: { width: W, height: H }, colorScheme: 'dark' });
  await expect(page.getByRole('heading', { name: 'Games' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/gm-home.png`, fullPage: true });

  // ---------------- Find the pairs
  await page.getByRole('button', { name: /Find the pairs/ }).click();
  await expect(page.locator('.pair-card')).toHaveCount(12);
  await expectInsideScreen(page, '.pairs-grid');
  await page.screenshot({ path: `${SHOTS}/gm-pairs-start.png` });
  const facts = page.locator('.pair-card.fact');
  const products = page.locator('.pair-card.product');
  const productOf = async (i: number) => {
    const [a, b] = ((await facts.nth(i).textContent()) ?? '').split('×').map((s) => Number(s.trim()));
    return a * b;
  };

  // A wrong pair wiggles and lets go; nothing is lost.
  const p0 = await productOf(0);
  const wrong = products.filter({ hasNotText: new RegExp(`^${p0}$`) }).first();
  await facts.nth(0).click();
  await wrong.click();
  await expect(page.getByText('Not those two. Try another!')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/gm-pairs-nope.png` });
  await expect(page.getByText(/0 of 6 pairs found/)).toBeVisible({ timeout: 3000 });

  for (let i = 0; i < 6; i++) {
    const fact = page.locator('.pair-card.fact:not(.matched)').first();
    const [a, b] = ((await fact.textContent()) ?? '').split('×').map((s) => Number(s.trim()));
    await fact.click();
    await page.locator('.pair-card.product:not(.matched)').filter({ hasText: new RegExp(`^${a * b}$`) }).click();
    if (i === 2) await page.screenshot({ path: `${SHOTS}/gm-pairs-half.png` });
  }
  await expect(page.getByText('You found them all!')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/gm-pairs-done.png` });
  await page.getByRole('button', { name: 'Back home' }).click();

  // ---------------- Fill a row
  await page.getByRole('button', { name: /Fill a row/ }).click();
  await expect(page.locator('.row-choice')).toHaveCount(9);
  await page.screenshot({ path: `${SHOTS}/gm-row-pick.png` });
  await page.getByRole('button', { name: 'The ×7 row' }).click();
  await expectInsideScreen(page, '.row-tiles');

  let missedTwice: string | null = null;
  let guided = false;
  for (let guard = 0; guard < 200 && !(await page.getByText('You filled the ×7 row!').isVisible()); guard++) {
    if (await page.locator('.guide').isVisible()) {
      await page.screenshot({ path: `${SHOTS}/gm-row-guide.png` });
      await completeGuide(page);
      guided = true;
      continue;
    }
    if (!(await padReady(page))) {
      await page.waitForTimeout(150);
      continue;
    }
    const expr = (await page.locator('.question').getAttribute('data-expr')) ?? '';
    const [a, b] = expr.split('×').map((s) => Number(s.trim()));
    // Miss the first question twice: it comes back later, then we work it out together.
    if (missedTwice === null || (missedTwice === expr && !guided)) {
      missedTwice = expr;
      await tapNumber(page, a * b + 1);
      if (String(a * b + 1).length < String(a * b).length) await page.getByRole('button', { name: 'Check' }).click();
      if (!(await page.locator('.guide').isVisible())) {
        await expect(page.getByText("Not yet. It'll come back.")).toBeVisible();
        await page.screenshot({ path: `${SHOTS}/gm-row-notyet.png` });
      }
      continue;
    }
    await tapNumber(page, a * b);
    if (guard === 4) await page.screenshot({ path: `${SHOTS}/gm-row-playing.png` });
  }
  expect(guided).toBe(true);
  await expect(page.getByText('You filled the ×7 row!')).toBeVisible();
  await expect(page.locator('.row-tile.filled')).toHaveCount(10);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOTS}/gm-row-pattern.png` });
  await expectInsideScreen(page, '.panel');
});
