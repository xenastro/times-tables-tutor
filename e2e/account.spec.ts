import { expect, test } from './quiet';
import { SHOTS } from './helpers';

const W = 360;
const H = 740;

test('a parent who forgot their password resets it with a one-time link', async ({ browser, playwright, baseURL }) => {
  test.skip(!baseURL?.includes('5173'), 'the reset link is only shown on screen by the local server');
  const email = `forgot+${Date.now()}@example.com`;
  const request = await playwright.request.newContext({ baseURL });
  await request.post('/api/auth/signup', { data: { email, password: 'first password' } });

  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  await page.goto('/parent');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.screenshot({ path: `${SHOTS}/acc-forgot.png` });
  await page.getByRole('button', { name: 'Send the link' }).click();
  // No email service is set up locally: the page says so honestly.
  await expect(page.getByText("This app can't send emails yet")).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/acc-forgot-sent.png` });
  await page.getByRole('link', { name: /Open the reset link/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
  await page.getByLabel('New password').fill('second password');
  await page.screenshot({ path: `${SHOTS}/acc-new-password.png` });
  await page.getByRole('button', { name: 'Save and sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Parent area' })).toBeVisible();

  const fresh = await playwright.request.newContext({ baseURL });
  expect((await fresh.post('/api/auth/login', { data: { email, password: 'second password' } })).status()).toBe(200);
  // 429 also means "not signed in": repeated test runs trip the login rate limit.
  expect([401, 429]).toContain((await fresh.post('/api/auth/login', { data: { email, password: 'first password' } })).status());
});

test('a parent deletes their account and everything in it', async ({ browser, playwright, baseURL }) => {
  const email = `delete+${Date.now()}@example.com`;
  const request = await playwright.request.newContext({ baseURL });
  await request.post('/api/auth/signup', { data: { email, password: 'delete me please' } });
  await request.post('/api/learners', { data: { displayName: 'Temp', settings: {} } });

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, storageState: await request.storageState() });
  const page = await ctx.newPage();
  await page.goto('/parent');
  await page.getByText('Delete my account').click();
  const del = page.getByRole('button', { name: 'Delete everything' });
  await expect(del).toBeDisabled();
  await page.getByLabel('Password').fill('delete me please');
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await del.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/acc-delete.png` });
  await del.click();
  await expect(page.getByText('Your account and all its data have been deleted.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/acc-deleted.png`, fullPage: true });

  const fresh = await playwright.request.newContext({ baseURL });
  expect([401, 429]).toContain((await fresh.post('/api/auth/login', { data: { email, password: 'delete me please' } })).status());
});

test('the privacy page is reachable before linking a phone, in English and Arabic', async ({ browser }) => {
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' })).newPage();
  await page.goto('/');
  await page.getByRole('button', { name: 'Privacy' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('Children have no emails or passwords')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/acc-privacy.png`, fullPage: true });
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.getByRole('heading', { name: 'الخصوصية' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/acc-privacy-ar.png`, fullPage: true });
  await page.getByRole('button', { name: 'English' }).click();
});
