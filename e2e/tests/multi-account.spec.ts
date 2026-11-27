import { expect, test } from '@playwright/test';
import {
  createCampaign,
  expectLive,
  expectSignedInAs,
  joinCampaign,
  newUser,
  openAccountMenu,
  register,
  signOut,
  submitRegistration,
} from './helpers';

/**
 * Several tabs in ONE browser context share one cookie jar, exactly like tabs of a real
 * browser. This is the setup that exposed issue #3 and that server tests can't reproduce.
 */
test.describe('accounts per tab', () => {
  test('two tabs signed in as different accounts stay on their own (issue #3)', async ({
    context,
  }) => {
    const alpha = newUser('Alpha');
    const bravo = newUser('Bravo');
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    // The reported steps: both tabs open on sign-up, then A in tab 1, then B in tab 2.
    await tab1.goto('/register');
    await tab2.goto('/register');
    await submitRegistration(tab1, alpha);
    await expectSignedInAs(tab1, alpha);
    await submitRegistration(tab2, bravo);
    await expectSignedInAs(tab2, bravo);

    // Tab 1 is still A, before and after a reload.
    await tab1.bringToFront();
    await expectSignedInAs(tab1, alpha);
    await tab1.reload();
    await expectSignedInAs(tab1, alpha);
    await tab2.reload();
    await expectSignedInAs(tab2, bravo);

    // And it acts as A: A runs a campaign, B joins it from the other tab.
    const code = await createCampaign(tab1, 'Two Tab Test');
    await expect(tab1.getByText('You are the Dungeon Master')).toBeVisible();
    await expectLive(tab1);
    await joinCampaign(tab2, code);
    await expect(tab2.getByText('Your character sheet')).toBeVisible();

    // A's live party board picks B up without a reload, then survives B signing out.
    await expect(tab1.getByRole('button', { name: /Bravo/ })).toBeVisible();
    await signOut(tab2);
    await expect(
      tab2.getByRole('button', { name: `Continue as ${alpha.displayName}` }),
    ).toBeVisible();
    await expectSignedInAs(tab1, alpha);
    await expectLive(tab1);
    await tab1.reload();
    await expectSignedInAs(tab1, alpha);
  });

  test('a new tab uses the only signed-in account', async ({ context }) => {
    const solo = newUser('Solo');
    await register(await context.newPage(), solo);

    const fresh = await context.newPage();
    await fresh.goto('/');
    await expectSignedInAs(fresh, solo);
  });

  test('a new tab asks which account to use when several are signed in', async ({ context }) => {
    const alpha = newUser('Alpha');
    const bravo = newUser('Bravo');
    const tab1 = await context.newPage();
    await register(tab1, alpha);

    // Add a second account from the same tab, without signing A out.
    const menu = await openAccountMenu(tab1);
    await menu.getByRole('button', { name: 'Add another account' }).click();
    await expect(tab1).toHaveURL(/\/login/);
    await tab1.getByRole('link', { name: 'Create an account' }).click();
    await submitRegistration(tab1, bravo);
    await expectSignedInAs(tab1, bravo);

    // A new tab doesn't guess: it offers both accounts.
    const tab2 = await context.newPage();
    await tab2.goto('/');
    await expect(tab2).toHaveURL(/\/login/);
    await expect(tab2.getByRole('button', { name: /^Continue as/ })).toHaveCount(2);
    await tab2.getByRole('button', { name: `Continue as ${alpha.displayName}` }).click();
    await expectSignedInAs(tab2, alpha);

    // Switching from the menu changes only this tab.
    const menu2 = await openAccountMenu(tab2);
    await menu2.getByRole('button', { name: `Switch to ${bravo.displayName}` }).click();
    await expectSignedInAs(tab2, bravo);
    await tab1.reload();
    await expectSignedInAs(tab1, bravo);
  });

  test('signing out ends that account in its other tabs too, including their live view', async ({
    context,
  }) => {
    const host = newUser('Host');
    const tab1 = await context.newPage();
    await register(tab1, host);
    await createCampaign(tab1, 'Short Session');
    await expectLive(tab1);

    const tab2 = await context.newPage();
    await tab2.goto('/');
    await expectSignedInAs(tab2, host);
    await signOut(tab2);

    // Tab 1's socket is closed by the server and the tab returns to sign-in on its own.
    await expect(tab1).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test('session tokens are not readable from page scripts', async ({ page }) => {
    await register(page, newUser('Private'));
    expect(await page.evaluate(() => document.cookie)).toBe('');
  });
});
