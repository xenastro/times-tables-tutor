import type { Browser, Page } from '@playwright/test';
import { expect, test } from './quiet';
import { SHOTS } from './helpers';

const W = 360;
const H = 740;

async function phone(browser: Browser, baseURL?: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(baseURL ? { baseURL } : {}) });
  return ctx.newPage();
}

/** A child starts alone through the front door: picture, colour, age. */
async function startAlone(page: Page, age: string, shots = false) {
  await page.goto('/');
  const start = page.getByRole('button', { name: 'Start practising' });
  await expect(start).toBeVisible();
  if (shots) await page.screenshot({ path: `${SHOTS}/onb-01-door.png` });
  await start.click();
  await page.getByRole('button', { name: '🐢' }).click();
  await page.getByRole('button', { name: 'green' }).click();
  if (shots) await page.screenshot({ path: `${SHOTS}/onb-02-pick.png` });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'How old are you?' })).toBeVisible();
  if (shots) await page.screenshot({ path: `${SHOTS}/onb-03-age.png` });
  await page.getByRole('button', { name: age, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hi!' })).toBeVisible();
}

async function showMyCode(page: Page): Promise<string> {
  await page.goto('/me');
  await page.getByRole('button', { name: 'Show my code' }).click();
  const code = (await page.locator('.code-display').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function signUp(page: Page, email: string, password = 'test password 123') {
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).last().click();
  await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();
}

const email = (tag: string) => `${tag}+${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

test('a child starts alone, moves to another phone, and a parent connects with the code', async ({ browser }) => {
  const kid = await phone(browser);
  await startAlone(kid, '6', true);
  // Young profile: the first lesson comes before the check-up.
  await expect(kid.getByRole('button', { name: /Lesson|lesson/ }).first()).toBeVisible();
  await kid.screenshot({ path: `${SHOTS}/onb-04-home.png` });

  const code = await showMyCode(kid);
  await kid.screenshot({ path: `${SHOTS}/onb-05-my-code.png`, fullPage: true });

  const second = await phone(browser);
  await second.goto('/');
  await second.getByRole('button', { name: 'I already use Ashra on another phone' }).click();
  await second.getByLabel('Code').fill(code);
  await second.screenshot({ path: `${SHOTS}/onb-06-carry-on.png` });
  await second.getByRole('button', { name: 'Carry on' }).click();
  await expect(second.getByRole('heading', { name: 'Hi!' })).toBeVisible();
  await expect(second.getByRole('button', { name: 'Make it yours' })).toHaveText('🐢');

  // A parent, on their own phone, connects the child with a fresh code.
  const connectCode = await showMyCode(kid);
  const parent = await phone(browser);
  await parent.goto('/parent');
  await signUp(parent, email('connect'));
  await parent.getByRole('button', { name: 'Already using Ashra? Connect them with their code instead.' }).click();
  await parent.getByLabel("Code from your child's phone").fill(connectCode);
  await parent.getByLabel('First name or nickname (optional)').fill('Rami');
  await parent.screenshot({ path: `${SHOTS}/onb-07-parent-connect-code.png` });
  await parent.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(parent.getByRole('heading', { name: 'Rami' })).toBeVisible();

  // The child's phone picks up the name.
  await kid.goto('/');
  await expect(kid.getByRole('heading', { name: 'Hi, Rami' })).toBeVisible({ timeout: 15_000 });
});

test('a parent signs in on the child’s own phone, connects them, and signs out there', async ({ browser }) => {
  const kid = await phone(browser);
  await startAlone(kid, '9');
  await expect(kid.getByRole('button', { name: "Let's see what you already know" })).toBeVisible();
  await kid.goto('/me');
  await kid.getByRole('button', { name: 'Parent area' }).click();
  await signUp(kid, email('onphone'));
  await expect(kid.getByRole('heading', { name: 'This child practises on this phone' })).toBeVisible();
  await kid.getByLabel('First name or nickname (optional)').fill('Lina');
  await kid.screenshot({ path: `${SHOTS}/onb-08-connect-here.png`, fullPage: true });
  await kid.getByRole('button', { name: 'Connect to my account' }).click();
  await expect(kid.getByRole('heading', { name: 'Connected! Whose phone is this?' })).toBeVisible();
  await expect(kid.getByRole('button', { name: /Lina/ })).toBeVisible();
  await kid.screenshot({ path: `${SHOTS}/onb-09-whose-phone.png`, fullPage: true });
  await kid.getByRole('button', { name: "My child's phone — sign me out" }).click();
  await expect(kid.getByRole('heading', { name: 'Hi, Lina' })).toBeVisible();
  await kid.goto('/parent');
  await expect(kid.getByRole('tab', { name: 'Sign in' })).toBeVisible();
});

test('one phone for parent and child: "this phone", then the parent area locks', async ({ browser }) => {
  const page = await phone(browser);
  const password = 'shared phone pass';
  await page.goto('/parent');
  await signUp(page, email('shared'), password);
  await page.getByLabel('First name or nickname').fill('Sami');
  await page.getByRole('button', { name: 'Add child' }).last().click();
  await expect(page.getByRole('heading', { name: 'Where will Sami practise?' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/onb-10-where.png`, fullPage: true });
  await page.getByRole('button', { name: 'On this phone' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Sami' })).toBeVisible();

  // Still open right after: the parent hands the phone back, which locks it.
  await page.goto('/parent');
  await page.getByRole('button', { name: 'Hand back to your child (locks this area)' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, Sami' })).toBeVisible();
  await page.goto('/parent');
  await expect(page.getByRole('heading', { name: /Parent area locked/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/onb-11-locked.png` });
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Unlock' }).click();
  await expect(page.getByRole('button', { name: /Sami/ })).toBeVisible();
});

test('a child who started alone is nudged to keep their progress safe', async ({ browser, playwright, baseURL }) => {
  const request = await playwright.request.newContext({ baseURL });
  const start = await (await request.post('/api/start', { data: { avatar: '🦊', settings: {} } })).json();
  const auth = { authorization: `Bearer ${start.token}` };
  const day = 86_400_000;
  const events = [3, 2, 1].map((d, i) => ({
    id: `nudge-${Date.now()}-${i}`,
    type: 'answer',
    ts: Date.now() - d * day,
    payload: { a: 2, b: 3, given: 6, correct: true, latencyMs: 1500, mode: 'checkup', hinted: false, sessionId: `s${i}` },
  }));
  expect((await request.post('/api/device/events', { data: { events }, headers: auth })).ok()).toBe(true);
  const { code } = await (await request.post('/api/device/code', { headers: auth })).json();

  const page = await phone(browser);
  await page.goto('/');
  await page.getByRole('button', { name: 'I already use Ashra on another phone' }).click();
  await page.getByLabel('Code').fill(code);
  await page.getByRole('button', { name: 'Carry on' }).click();
  await expect(page.getByRole('heading', { name: 'Keep your progress safe' })).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${SHOTS}/onb-12-nudge.png`, fullPage: true });
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('heading', { name: 'Keep your progress safe' })).toBeHidden();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hi!' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Keep your progress safe' })).toBeHidden();
});

test('the child comes back after the browser clears its storage', async ({ browser }) => {
  const page = await phone(browser);
  await startAlone(page, '10');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('ashra');
        req.onsuccess = req.onerror = req.onblocked = () => resolve();
      }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hi!' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Make it yours' })).toHaveText('🐢');
});

test('a parent adds a passkey and signs in with it', async ({ browser, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'passkeys need the local site on localhost');
  // Passkeys need a domain name, not 127.0.0.1.
  const page = await phone(browser, 'http://localhost:5173');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
  });
  await page.goto('/parent');
  await signUp(page, email('passkey'));
  await page.getByRole('button', { name: 'Add a passkey on this device' }).click();
  await expect(page.getByText('Passkey added')).toBeVisible();
  await page.getByRole('heading', { name: 'Passkeys' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/onb-13-passkeys.png` });
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: 'Sign in with a passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();
});

test('the front door in Arabic', async ({ browser }) => {
  const page = await phone(browser);
  await page.goto('/');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.getByRole('button', { name: 'ابدأ التمرين' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.screenshot({ path: `${SHOTS}/onb-14-door-ar.png` });
  await page.getByRole('button', { name: 'ابدأ التمرين' }).click();
  await page.getByRole('button', { name: '🦉' }).click();
  await page.getByRole('button', { name: 'متابعة' }).click();
  await page.getByRole('button', { name: '8', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'مرحبًا!' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/onb-15-home-ar.png` });
});
