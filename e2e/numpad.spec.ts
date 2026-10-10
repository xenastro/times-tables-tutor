import { expect, test } from './quiet';
import { solveExpr } from './helpers';

/**
 * One tap on a number-pad key types one digit, whatever events the phone sends for it.
 * Replays each browser's sequence by hand, because these quirks can't be emulated:
 * - Android Chrome: pointerdown (touch), then a click that also says "touch".
 * - iOS Safari 18.2+: pointerdown (touch), then a click that says "mouse" (WebKit bug 282988).
 * - Older iOS Safari: pointerdown (touch), then a plain MouseEvent click with no pointerType.
 */
const TAPS: Record<string, string> = {
  android: 'touch',
  'iOS 18.2+': 'mouse',
  'older iOS': '',
};

for (const [phone, clickType] of Object.entries(TAPS)) {
  test(`one tap types one digit (${phone})`, async ({ page, baseURL }) => {
    test.skip(!baseURL?.includes('5173'), 'the guide preview page only exists in the dev server');
    await page.goto('/dev/guide?a=4&b=10');
    const expr = page.locator('.guide-expr');
    const question = (await expr.getAttribute('data-expr')) ?? '';
    const answer = String(solveExpr(question + ' = ?'));
    expect(answer.length).toBeGreaterThan(1); // a one-digit answer would hide a doubled tap

    await page
      .locator('.numpad')
      .getByRole('button', { name: answer[0], exact: true })
      .evaluate(async (key, clickType) => {
        const down = new PointerEvent('pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true });
        key.dispatchEvent(down);
        // A real click comes a moment after the finger lifts, once the first digit is on screen.
        await new Promise((r) => setTimeout(r, 50));
        key.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true }));
        const init = { bubbles: true, cancelable: true, detail: 1 };
        key.dispatchEvent(clickType ? new PointerEvent('click', { ...init, pointerType: clickType }) : new MouseEvent('click', init));
      }, clickType);

    await expect(page.locator('.guide-input')).toHaveText(answer[0]);
    await expect(expr).toHaveAttribute('data-expr', question); // still on the same step
  });
}

test('a real touch tap and a mouse click each type one digit', async ({ page, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'the guide preview page only exists in the dev server');
  await page.goto('/dev/guide?a=4&b=10');
  const answer = String(solveExpr(((await page.locator('.guide-expr').getAttribute('data-expr')) ?? '') + ' = ?'));
  const key = page.locator('.numpad').getByRole('button', { name: answer[0], exact: true });
  await key.tap();
  await expect(page.locator('.guide-input')).toHaveText(answer[0]);
  await page.locator('.numpad').getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.guide-input')).toHaveText('?');
  await key.click();
  await expect(page.locator('.guide-input')).toHaveText(answer[0]);
});
