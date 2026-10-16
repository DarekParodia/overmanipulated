// S7-103: „O grze” opens from the main-menu footer on desktop (1366×768) and on the smallest
// landscape phone (640×360). Gra shows the authors and the version (package + sha + protocol),
// Zasoby renders CREDITS.md (heading, list, table) with an offline error state and a retry,
// Biblioteki lists the libraries. Keyboard, gamepad and touch all reach and close it.
import { expect, type Locator, type Page, test } from '@playwright/test';
import { closePlayers, DESKTOP, openPlayer, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

/** Taps on touch projects, clicks on desktop. */
async function press(locator: Locator, touch: boolean): Promise<void> {
  await (touch ? locator.tap() : locator.click());
}

/** The dialog sits inside the viewport and the page never scrolls sideways. */
async function expectFits(page: Page, dialog: Locator): Promise<void> {
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('„O grze” shows authors, version, credits and libraries', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const { page } = await openPlayer(
    browser,
    'Ciekawska',
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  const dialog = page.getByTestId('about');

  // Offline first: the credits fail, then load on „Spróbuj ponownie”.
  await page.route('**/assets/CREDITS.md', (route) => route.abort('internetdisconnected'));

  await press(page.getByTestId('menu-footer').getByTestId('open-about'), touch);
  await expect(dialog.getByRole('heading', { name: 'O grze', level: 2 })).toBeVisible();
  await expect(dialog.getByTestId('about-tab-game')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('about-authors')).toContainText('Kamil Wida');
  await expect(dialog.getByTestId('about-licence')).toContainText('© 2026 Kamil Wida');
  await expect(dialog.getByTestId('about-version')).toContainText(
    /\d+\.\d+\.\d+\+(?:[0-9a-f]{7,12}|dev) · protokół \d+/,
  );
  await expect(dialog.getByTestId('about-privacy-link')).toHaveAttribute('href', '/prywatnosc');
  await expectFits(page, dialog);

  await press(dialog.getByTestId('about-tab-credits'), touch);
  const credits = dialog.getByTestId('about-credits');
  await expect(credits).toHaveAttribute('data-status', 'error');
  await expect(dialog.getByTestId('about-credits-error')).toBeVisible();
  await page.unroute('**/assets/CREDITS.md');
  await press(dialog.getByTestId('about-retry'), touch);
  await expect(credits).toHaveAttribute('data-status', 'ready');
  await expect(credits.getByRole('heading', { name: 'Asset credits' })).toBeVisible();
  await expect(credits.getByRole('listitem')).toHaveCount(2);
  await expect(credits.getByRole('table')).toBeVisible();
  // Each cell knows its column (phones stack the rows into cards labelled with it).
  await expect(credits.locator('td[data-label="Licence"]').first()).toContainText('own');
  // No sprite yet: the voice credit honestly says the recording is pending.
  await expect(dialog.getByTestId('about-voice')).toContainText('Czekamy na nagranie ochotnika');
  await expectFits(page, dialog);
  await testInfo.attach(`about-credits-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await press(dialog.getByTestId('about-tab-libraries'), touch);
  const libraries = dialog.getByTestId('about-libraries');
  await expect(libraries.getByRole('table')).toHaveCount(2);
  await expect(libraries).toContainText('three');
  await expect(libraries).toContainText('drizzle-orm');
  await expectFits(page, dialog);

  await press(dialog.getByTestId('about-close'), touch);
  await expect(dialog).toBeHidden();

  // The keyboard alone: Enter opens, Tab walks the tabs, „Gotowe” and the text panel, PageDown
  // scrolls the focused panel, Esc closes.
  if (!touch) {
    await page.getByTestId('open-about').focus();
    // Enter acts on the element that has DOM focus (a control elsewhere would take it otherwise),
    // so wait until the focus has landed before the key goes out.
    await expect(page.getByTestId('open-about')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByTestId('about-tab-game')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(dialog.getByTestId('about-tab-libraries')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByTestId('about-tab-libraries')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await expect(dialog.getByTestId('about-close')).toBeFocused();
    await page.keyboard.press('Tab');
    const panel = dialog.getByTestId('about-panel-libraries');
    await expect(panel).toBeFocused();
    await page.keyboard.press('PageDown');
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }
});

/** A fake standard gamepad; the test presses its buttons through `window.__pad`. */
function installFakePad(): void {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = {
    id: 'e2e pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
  (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad = {
    press(i, down) {
      const button = buttons[i];
      if (button) {
        button.pressed = down;
        button.value = down ? 1 : 0;
      }
    },
  };
}

/** Presses and releases one pad button (standard mapping: 0 A, 1 B, 3 Y, 13 d-pad down). */
async function tapPad(page: Page, button: number): Promise<void> {
  for (const down of [true, false]) {
    await page.evaluate(
      ([index, isDown]) =>
        (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad.press(
          index,
          isDown,
        ),
      [button, down] as const,
    );
    await page.waitForTimeout(120);
  }
}

// S7-103: with a pad at 640×360, A opens it from the footer, Y walks the tabs, down focuses the text panel and then scrolls
// it, B closes.
test('a pad switches tabs with Y, scrolls the credits and closes with B', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad');
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  trackContext(context);
  await context.addInitScript(installFakePad);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  // The footer link is one of the menu's controls; A clicks the focused one.
  await page.getByTestId('open-about').focus();
  await tapPad(page, 0);
  const dialog = page.getByTestId('about');
  await expect(dialog.getByTestId('about-tab-game')).toBeFocused();

  await tapPad(page, 3);
  await expect(dialog.getByTestId('about-tab-credits')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('about-tab-credits')).toBeFocused();
  await expect(dialog.getByText('Y zmienia dział')).toBeVisible();
  await expect(dialog.getByTestId('about-credits')).toHaveAttribute('data-status', 'ready');

  const panel = dialog.getByTestId('about-panel-credits');
  await tapPad(page, 13);
  await expect(panel).toBeFocused();
  await tapPad(page, 13);
  await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  await tapPad(page, 1);
  await expect(dialog).toBeHidden();
});
