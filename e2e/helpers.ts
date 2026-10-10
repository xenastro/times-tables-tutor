import { expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';

export const INVITE = process.env.INVITE_CODE ?? 'family-test';
export const SHOTS = process.env.SHOTS_DIR ?? 'e2e-results/shots';

/** Answer for a guide step, e.g. "10 × 3 = ?", "half of 30 = ?", "70 − 7 = ?", "? × 7 = 56". */
export function solveExpr(text: string): number {
  let m;
  if ((m = text.match(/\?\s*×\s*(\d+)\s*=\s*(\d+)/))) return Number(m[2]) / Number(m[1]);
  if ((m = text.match(/(\d+)\s*×\s*\?\s*=\s*(\d+)/))) return Number(m[2]) / Number(m[1]);
  if ((m = text.match(/(\d+)\s*×\s*(\d+)/))) return Number(m[1]) * Number(m[2]);
  if ((m = text.match(/(\d+)\s*\+\s*(\d+)/))) return Number(m[1]) + Number(m[2]);
  if ((m = text.match(/(\d+)\s*−\s*(\d+)/))) return Number(m[1]) - Number(m[2]);
  if ((m = text.match(/half of (\d+)/))) return Number(m[1]) / 2;
  throw new Error('cannot solve ' + text);
}

export interface AskedQuestion {
  a: number;
  b: number;
  /** What a learner who knows it would type. */
  expected: number;
  missing: boolean;
}

/** Reads the practice question ("7 × 8" or "? × 8 = 56") from its data-expr attribute. */
export async function readQuestion(page: Page): Promise<AskedQuestion> {
  const expr = (await page.locator('.question').getAttribute('data-expr')) ?? '';
  let m;
  if ((m = expr.match(/^\?\s*×\s*(\d+)\s*=\s*(\d+)$/))) {
    const b = Number(m[1]);
    const a = Number(m[2]) / b;
    return { a, b, expected: a, missing: true };
  }
  if ((m = expr.match(/^(\d+)\s*×\s*\?\s*=\s*(\d+)$/))) {
    const a = Number(m[1]);
    const b = Number(m[2]) / a;
    return { a, b, expected: b, missing: true };
  }
  m = expr.match(/(\d+)\s*×\s*(\d+)/);
  if (!m) throw new Error('cannot read question ' + expr);
  return { a: Number(m[1]), b: Number(m[2]), expected: Number(m[1]) * Number(m[2]), missing: false };
}

export async function tapNumber(page: Page, n: number) {
  for (const d of String(n)) await page.locator('.numpad').getByRole('button', { name: d, exact: true }).click();
}

/** True once the number pad is on screen and accepting taps. */
export async function padReady(page: Page): Promise<boolean> {
  return page.locator('.numpad button').first().isEnabled({ timeout: 1000 }).catch(() => false);
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

/** Creates a parent + child through the API and returns the parent's request context and the child's id. */
export async function newLearner(request: APIRequestContext, settings: object, name = 'Sam') {
  await request.post('/api/auth/signup', {
    data: { email: `v+${Date.now()}${Math.random()}@example.com`, password: 'test password 123', inviteCode: INVITE },
  });
  const { learner } = await (
    await request.post('/api/learners', { data: { displayName: name, avatar: '🐙', theme: 'violet', settings } })
  ).json();
  return learner as { id: string; displayName: string };
}

/** Links a fresh phone (browser context) to the learner and waits for the home screen. */
export async function linkPhone(
  browser: Browser,
  request: APIRequestContext,
  learner: { id: string; displayName: string },
  opts: { colorScheme?: 'light' | 'dark'; viewport?: { width: number; height: number } } = {},
) {
  const { code } = await (await request.post(`/api/learners/${learner.id}/pairing-code`)).json();
  const ctx = await browser.newContext({
    colorScheme: opts.colorScheme ?? 'light',
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
  });
  const page = await ctx.newPage();
  await page.goto('/');
  await page.getByLabel('Code from your parent').fill(code);
  await page.getByRole('button', { name: 'Link this phone' }).click();
  await expect(page.getByRole('heading', { name: `Hi, ${learner.displayName}` })).toBeVisible();
  return page;
}

/**
 * Uploads a finished check-up in which every fact up to `max` was answered fast and right,
 * so practice starts with a fully fluent map. Uses a separate "phone" paired through the API.
 */
export async function seedFluentCheckup(request: APIRequestContext, learnerId: string, max = 10) {
  const { code } = await (await request.post(`/api/learners/${learnerId}/pairing-code`)).json();
  const { token } = await (await request.post('/api/pair', { data: { code, label: 'seed' } })).json();
  const t0 = Date.now() - 60_000;
  const sessionId = `seed-${t0}`;
  const events: object[] = [{ id: `${sessionId}-s`, type: 'session_start', ts: t0, payload: { sessionId, kind: 'checkup' } }];
  let i = 0;
  for (let a = 1; a <= max; a++)
    for (let b = a; b <= max; b++)
      events.push({
        id: `${sessionId}-${i}`,
        type: 'answer',
        ts: t0 + ++i * 100,
        payload: { a, b, given: a * b, correct: true, latencyMs: 1500, mode: 'checkup', hinted: false, sessionId },
      });
  events.push({ id: `${sessionId}-e`, type: 'checkup_end', ts: t0 + ++i * 100, payload: { sessionId } });
  const res = await request.post('/api/device/events', { data: { events }, headers: { authorization: `Bearer ${token}` } });
  expect(res.ok()).toBe(true);
}
