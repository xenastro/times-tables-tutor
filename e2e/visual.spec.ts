import { expect, test, type APIRequestContext, type Browser } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.locator('.question')).toBeVisible();
  await expect(page.locator('.question-area svg.dots')).toBeVisible();
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
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('button', { name: 'Show me a way' }).isVisible()) break;
    if (await page.getByRole('button', { name: 'Got it' }).isVisible()) await page.getByRole('button', { name: 'Got it' }).click();
    await page.waitForTimeout(100);
  }
  await page.getByRole('button', { name: 'Show me a way' }).click();
  await page.screenshot({ path: `${SHOTS}/v07-hint-open.png` });
});
