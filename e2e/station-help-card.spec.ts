import { type BrowserContextOptions, expect, test } from '@playwright/test';
import { closePlayers, DESKTOP, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

// S7-94: the Styleguide shows both station help card variants; on the smallest supported
// landscape phone (640×360) they stack, fit the width and keep „Rozumiem” reachable.
test('the styleguide shows both station help card variants', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const options: BrowserContextOptions = touch
    ? { ...PHONE, viewport: { width: 640, height: 360 } }
    : DESKTOP;
  const context = await browser.newContext(options);
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?styleguide');

  const section = page.locator('#station-help');
  await section.scrollIntoViewIfNeeded();
  const width = page.viewportSize()?.width ?? 0;

  for (const variant of ['inPlay', 'full'] as const) {
    const card = page.getByTestId(`station-help-${variant}`).getByTestId('station-help-card');
    await expect(card).toHaveAttribute('data-variant', variant);
    await expect(card).toHaveAttribute('data-kind', 'imageSearch');
    await expect(card.getByRole('heading', { name: 'Lupa obrazu' })).toBeVisible();
    await expect(card.getByText('Czy to zdjęcie krążyło już wcześniej?')).toBeVisible();
    await expect(card.getByText('Termin teczki biegnie dalej')).toBeVisible();
    await expect(card.getByTestId('station-help-got')).toHaveText('Rozumiem');
    await expect(card.getByTestId('station-help-real-world')).toHaveCount(
      variant === 'full' ? 1 : 0,
    );
    const box = await card.boundingBox();
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  }
  // No sideways scrolling on the page itself.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  // Another station and device: the steps and the drawn controls follow.
  await section.getByRole('button', { name: 'Archiwum' }).click();
  await section.getByRole('button', { name: 'Dotyk', exact: true }).click();
  const inPlay = page.getByTestId('station-help-inPlay').getByTestId('station-help-card');
  await expect(inPlay).toHaveAttribute('data-kind', 'archive');
  await expect(inPlay).toHaveAttribute('data-device', 'touch');
  await expect(inPlay.getByTestId('station-help-drawing')).toContainText('Przesuń');
  await section.getByRole('button', { name: 'Pad', exact: true }).click();
  await expect(inPlay).toHaveAttribute('data-device', 'gamepad');
  await expect(inPlay.getByRole('listitem')).toHaveCount(3);

  await inPlay.scrollIntoViewIfNeeded();
  await testInfo.attach(`station-help-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
