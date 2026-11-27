import { expect, test } from '@playwright/test';

/**
 * The app must stay usable when the API answers with something that isn't JSON, for
 * example a misconfigured proxy serving the app's own HTML page for /api requests.
 */
test.describe('unexpected API responses', () => {
  test('an HTML page in place of JSON shows sign-in instead of spinning forever', async ({
    page,
  }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Not the API</body></html>',
      }),
    );

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByText('Loading…')).toHaveCount(0);
  });

  test('signing in through a broken proxy explains what went wrong', async ({ page }) => {
    // GETs get an HTML page with 200, POSTs an HTML 404, as a dev server with a broken
    // /api proxy answers.
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: route.request().method() === 'GET' ? 200 : 404,
        contentType: 'text/html',
        body: '<!doctype html><html><body>Not the API</body></html>',
      }),
    );

    await page.goto('/login');
    await page.getByLabel('Email').fill('someone@e2e.test');
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toHaveText('Unexpected response from the server');
  });
});
