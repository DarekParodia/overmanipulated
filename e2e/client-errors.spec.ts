// Client errors reach the server through POST /api/client-errors: an uncaught window error (the
// global reporting in apps/client/src/net/client-errors.ts) and a render error caught by the error
// boundary (apps/client/src/errors/ErrorBoundary.tsx). Desktop only: the report path is the same on
// every device, so the mobile projects add nothing here.
import { expect, test } from '@playwright/test';

const MESSAGE = 'e2e window error';

test.skip(({ isMobile }) => isMobile, 'desktop project only');

test('reports an uncaught window error to the server', async ({ page }) => {
  await page.goto('/');
  // Matched on the message, so an unrelated error on the page cannot satisfy the test.
  const reported = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/client-errors' &&
      (request.postData() ?? '').includes(MESSAGE),
  );
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error('e2e window error');
    }, 0),
  );
  const request = await reported;
  expect(request.postDataJSON()).toMatchObject({ source: 'window', message: MESSAGE });
  expect((await request.response())?.status()).toBe(204);
});

test('a render error shows the fallback and is reported as a boundary error', async ({ page }) => {
  // The Styleguide is a lazy chunk. Aborting it makes its render throw inside App, which is the
  // error boundary's job: it shows the fallback and reports the error once.
  await page.route('**/assets/Styleguide-*.js', (route) => route.abort());
  const reported = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/client-errors' &&
      (request.postData() ?? '').includes('"source":"boundary"'),
  );
  await page.goto('/?styleguide');
  await expect(page.getByRole('alert')).toHaveText('Coś się zepsuło w redakcji.');
  await expect(page.getByRole('button', { name: 'Odśwież' })).toBeVisible();
  const request = await reported;
  expect(request.postDataJSON()).toMatchObject({ source: 'boundary', path: '/' });
  expect((await request.response())?.status()).toBe(204);
});
