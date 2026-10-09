import { expect, test, type Page } from '@playwright/test';
import { solveExpr, tapNumber } from './helpers';

const INVITE = process.env.INVITE_CODE ?? 'family-test';
const SHOTS = process.env.SHOTS_DIR ?? 'e2e-results/shots';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

let wrongGuideStepDone = false;

/**
 * Plays a session until the summary appears. `answerFor` decides what to type for a question
 * (null = "Not sure yet"). Returns how many questions were answered.
 */
async function playSession(page: Page, answerFor: (a: number, b: number, i: number) => number | null, shotPrefix: string) {
  let answered = 0;
  const seen = new Set<string>();
  for (let guard = 0; guard < 400; guard++) {
    await page.waitForTimeout(80);
    if (await page.getByRole('button', { name: 'Back home' }).isVisible()) return answered;

    const keepGoing = page.getByRole('button', { name: 'Keep going' });
    if (await keepGoing.isVisible()) {
      if (!seen.has('break')) await shot(page, `${shotPrefix}-break`), seen.add('break');
      await keepGoing.click();
      continue;
    }
    // Step-by-step guide: answer each in-between step (once, deliberately wrong first).
    const guideExpr = page.locator('.guide-expr');
    if ((await guideExpr.isVisible()) && (await page.locator('.numpad button').first().isEnabled({ timeout: 1000 }).catch(() => false))) {
      const text = ((await guideExpr.getAttribute('data-expr')) ?? '') + ' = ?';
      if (text.includes('?')) {
        if (!seen.has('guide')) await shot(page, shotPrefix + "-guide"), seen.add("guide");
        const ans = solveExpr(text);
        if (!wrongGuideStepDone) {
          wrongGuideStepDone = true;
          await tapNumber(page, ans === 1 ? 2 : ans - 1);
          if (String(ans - 1).length < String(ans).length) await page.getByRole('button', { name: 'Check' }).click();
          await expect(page.getByText(/Type \d+ to keep going/)).toBeVisible();
          await shot(page, shotPrefix + "-guide-wrong-step");
        }
        await tapNumber(page, ans);
        await page.waitForTimeout(450);
        continue;
      }
    }
    const backToPractice = page.getByRole('button', { name: 'Back to practice' });
    if (await backToPractice.isVisible()) {
      if (!seen.has('guide-done')) await shot(page, shotPrefix + "-guide-done"), seen.add("guide-done");
      await backToPractice.click();
      continue;
    }
    const gotIt = page.getByRole('button', { name: 'Got it' });
    if (await gotIt.isVisible()) {
      const tag = (await page.locator('.guide').isVisible()) ? 'mistake-guide-done' : 'reveal';
      if (!seen.has(tag)) await shot(page, `${shotPrefix}-${tag}`), seen.add(tag);
      await gotIt.click();
      continue;
    }
    const cont = page.getByRole('button', { name: 'Continue', exact: true });
    if (await cont.isVisible()) {
      await shot(page, `${shotPrefix}-intro`);
      await cont.click();
      continue;
    }
    const q = page.locator('.question');
    const pad = page.locator('.numpad button').first();
    if ((await q.isVisible()) && (await pad.isEnabled({ timeout: 1000 }).catch(() => false))) {
      const text = (await q.textContent()) ?? '';
      const [a, b] = text.split('×').map((s) => Number(s.trim()));
      if (!seen.has('question')) await shot(page, `${shotPrefix}-question`), seen.add('question');
      const ans = answerFor(a, b, answered);
      if (ans === null) await page.getByRole('button', { name: 'Not sure yet' }).click();
      else {
        await tapNumber(page, ans);
        // A shorter wrong answer needs an explicit check.
        if (String(ans).length < String(a * b).length) await page.getByRole('button', { name: 'Check' }).click();
      }
      answered++;
    }
  }
  throw new Error('session did not finish');
}

test('parent sets up, child does check-up and practice, parent sees progress', async ({ browser }) => {
  // ---------------- Parent: sign up, add child, get link code
  const parentCtx = await browser.newContext();
  const parent = await parentCtx.newPage();
  await parent.goto('/parent');
  await parent.getByRole('tab', { name: 'Create account' }).click();
  await parent.getByLabel('Email').fill(`parent+${Date.now()}@example.com`);
  await parent.getByLabel('Password').fill('test password 123');
  await parent.getByLabel('Invite code').fill(INVITE);
  await shot(parent, '01-parent-signup');
  await parent.getByRole('button', { name: 'Create account' }).last().click();

  await parent.getByLabel('First name or nickname').fill('Test Kid');
  await shot(parent, '02-parent-add-child');
  await parent.getByRole('button', { name: 'Add child' }).last().click();
  await expect(parent.getByRole('heading', { name: 'Test Kid' })).toBeVisible();
  await parent.getByRole('button', { name: 'Link a phone' }).click();
  const code = (await parent.locator('.code-display').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  await shot(parent, '03-parent-code');

  // ---------------- Child phone: link
  const childCtx = await browser.newContext();
  const child = await childCtx.newPage();
  await child.goto('/');
  await shot(child, '04-child-welcome');
  await child.getByLabel('Code from your parent').fill(code);
  await child.getByRole('button', { name: 'Link this phone' }).click();
  await expect(child.getByRole('heading', { name: 'Hi, Test Kid' })).toBeVisible();
  await shot(child, '05-child-home-new');

  // Parent page notices the link.
  await expect(parent.getByText('✓ Linked')).toBeVisible({ timeout: 10_000 });

  // ---------------- Check-up: knows ×1, ×10, ×2, ×5 well; unsure of 7s and 8s; slips on some 6s.
  await child.getByRole('button', { name: "Let's see what you already know" }).click();
  const checkupAnswered = await playSession(
    child,
    (a, b) => {
      if (a === 7 || b === 7 || a === 8 || b === 8) return null;
      if ((a === 6 || b === 6) && a * b > 30) return a * b + 2;
      return a * b;
    },
    '06-checkup',
  );
  expect(checkupAnswered).toBeGreaterThan(15);
  await expect(child.getByRole('heading', { name: 'Check-up finished!' })).toBeVisible();
  await shot(child, '07-checkup-summary');
  await child.getByRole('button', { name: 'Calm' }).click();
  await child.getByRole('button', { name: 'Back home' }).click();
  await expect(child.getByRole('button', { name: "Start today's practice" })).toBeVisible();
  await shot(child, '08-child-home-after-checkup');

  // ---------------- Practice: mostly right, a wrong answer every 7th question.
  await child.getByRole('button', { name: "Start today's practice" }).click();
  const practiced = await playSession(child, (a, b, i) => (i % 7 === 3 ? Math.max(0, a * b - 1) : a * b), '09-practice');
  expect(practiced).toBeGreaterThanOrEqual(20);
  await expect(child.getByRole('heading', { name: 'Session done' })).toBeVisible();
  await shot(child, '10-practice-summary');
  await child.getByRole('button', { name: 'OK' }).click();
  await child.getByRole('button', { name: 'Back home' }).click();
  await expect(child.getByText('You practised today. Nice work.')).toBeVisible();

  // Map screen and a fact detail
  await child.getByRole('button', { name: 'See your map' }).last().click();
  await shot(child, '11-map');
  await child.locator('.factmap button').nth(6 * 10 + 7).click();
  await shot(child, '12-fact-sheet');
  await child.getByRole('button', { name: 'Close' }).click();
  await child.goBack();

  // Customize
  await child.getByRole('button', { name: 'Make it yours' }).click();
  await child.getByRole('button', { name: '🦉' }).click();
  await child.getByRole('button', { name: 'violet' }).click();
  await shot(child, '13-customize');
  await child.getByRole('button', { name: 'Done' }).click();

  // Let the background sync upload everything.
  await expect(child.getByText('All saved')).toBeVisible({ timeout: 15_000 });
  await child.waitForTimeout(2500);
  await expect(child.getByText('All saved')).toBeVisible({ timeout: 15_000 });

  // ---------------- Parent dashboard shows progress
  await parent.reload();
  await expect(parent.getByRole('heading', { name: 'Test Kid' })).toBeVisible();
  await expect(parent.locator('table.simple tbody tr')).toHaveCount(2);
  await expect(parent.getByText('Check-up', { exact: true })).toBeVisible();
  await shot(parent, '14-parent-dashboard');
  await parent.screenshot({ path: `${SHOTS}/15-parent-dashboard-full.png`, fullPage: true });
  await parent.getByText('😌').isVisible();

  // ---------------- Offline: practice still works and syncs later
  await childCtx.setOffline(true);
  await child.getByRole('button', { name: 'Practise a little more' }).click();
  await playSession(child, (a, b) => a * b, '16-offline');
  await child.getByRole('button', { name: 'Back home' }).click();
  await expect(child.getByText(/Offline/)).toBeVisible({ timeout: 10_000 });
  await childCtx.setOffline(false);
  await child.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(child.getByText('All saved')).toBeVisible({ timeout: 15_000 });
  await parent.reload();
  await expect(parent.locator('table.simple tbody tr')).toHaveCount(3);

  // ---------------- Reinstall: a fresh phone linked to the same child gets the history back
  await parent.getByRole('button', { name: 'Link a phone' }).click();
  const code2 = (await parent.locator('.code-display').textContent())!.trim();
  const phone2 = await (await browser.newContext()).newPage();
  await phone2.goto('/');
  await phone2.getByLabel('Code from your parent').fill(code2);
  await phone2.getByRole('button', { name: 'Link this phone' }).click();
  await expect(phone2.getByRole('button', { name: 'Practise a little more' })).toBeVisible({ timeout: 15_000 });
  await shot(phone2, '17-second-phone-restored');
});
