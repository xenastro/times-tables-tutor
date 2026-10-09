import type { Page } from '@playwright/test';

/** Answer for a guide step, e.g. "10 × 3 = ?", "half of 30 = ?", "70 − 7 = ?". */
export function solveExpr(text: string): number {
  let m;
  if ((m = text.match(/(\d+)\s*×\s*(\d+)/))) return Number(m[1]) * Number(m[2]);
  if ((m = text.match(/(\d+)\s*\+\s*(\d+)/))) return Number(m[1]) + Number(m[2]);
  if ((m = text.match(/(\d+)\s*−\s*(\d+)/))) return Number(m[1]) - Number(m[2]);
  if ((m = text.match(/half of (\d+)/))) return Number(m[1]) / 2;
  throw new Error('cannot solve ' + text);
}

export async function tapNumber(page: Page, n: number) {
  for (const d of String(n)) await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
}

/** Work through whatever guide is on screen, then leave it. */
export async function completeGuide(page: Page) {
  for (let i = 0; i < 8; i++) {
    const expr = page.locator('.guide-expr');
    if (!(await expr.isVisible())) break;
    const text = ((await expr.getAttribute('data-expr')) ?? '') + ' = ?';
    if (text.includes('?')) await tapNumber(page, solveExpr(text));
    await page.waitForTimeout(450);
  }
  const back = page.getByRole('button', { name: /Back to practice|Got it/ });
  if (await back.isVisible()) await back.click();
}
