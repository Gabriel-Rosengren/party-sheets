import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export interface TestUser {
  displayName: string;
  email: string;
  password: string;
}

export const newUser = (displayName: string): TestUser => ({
  displayName,
  email: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID()}@e2e.test`,
  password: 'correct horse battery',
});

/** The header's account menu button, which shows who this tab is signed in as. */
export const accountButton = (page: Page) => page.locator('header summary');

export const expectSignedInAs = async (page: Page, user: TestUser) => {
  await expect(accountButton(page)).toContainText(user.displayName);
};

/** Fills the registration form; the page must be on (or navigating to) /register. */
export const submitRegistration = async (page: Page, user: TestUser) => {
  // Wait for the register form itself: the sign-in form has an Email field too, and
  // filling it mid-navigation loses the value.
  await expect(page.getByRole('heading', { name: 'Join the party' })).toBeVisible();
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Display name').fill(user.displayName);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
};

export const register = async (page: Page, user: TestUser) => {
  await page.goto('/register');
  await submitRegistration(page, user);
  await expectSignedInAs(page, user);
};

export const openAccountMenu = async (page: Page) => {
  await accountButton(page).click();
  return page.locator('header details');
};

export const signOut = async (page: Page) => {
  const menu = await openAccountMenu(page);
  await menu.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
};

/** Creates a campaign from the dashboard; returns its invite code. */
export const createCampaign = async (page: Page, name = 'E2E Campaign') => {
  await page.goto('/');
  await page.getByPlaceholder('Campaign name').fill(name);
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await expect(page).toHaveURL(/\/campaigns\//);
  const code = page.getByText('Invite code').locator('xpath=following-sibling::div[1]');
  await expect(code).toHaveText(/^[A-Z0-9]{6}$/);
  return code.innerText();
};

export const joinCampaign = async (page: Page, inviteCode: string) => {
  await page.goto('/');
  await page.getByPlaceholder('ABC234').fill(inviteCode);
  await page.getByRole('button', { name: 'Join campaign' }).click();
  await expect(page).toHaveURL(/\/campaigns\//);
};

export const expectLive = async (page: Page) => {
  await expect(page.getByRole('status').filter({ hasText: 'Live' })).toBeVisible();
};

/** Replaces a field's value the way a user would (select all, type). */
export const setField = async (page: Page, label: string, value: string) => {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.blur();
};

export const expectAllSaved = async (page: Page) => {
  await expect(page.getByText('All changes saved')).toBeVisible();
};
