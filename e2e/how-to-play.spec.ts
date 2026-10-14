import { expect, type Locator, type Page, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE, trackContext } from './helpers.ts';

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

// S7-96: „Jak grać” opens from the main menu, the settings and the lobby, on desktop
// (1366×768) and on the smallest landscape phone (640×360); its three tabs work and it closes.
test('„Jak grać” opens from the menu, the settings and the lobby', async ({
  browser,
}, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const host = await openPlayer(
    browser,
    'Pomocna',
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  const { page } = host;
  const dialog = page.getByTestId('how-to-play');

  // The corner's three icon buttons stay clear of the menu card on a phone.
  if (touch) {
    const corner = await page.getByRole('button', { name: 'Ustawienia' }).boundingBox();
    const card = await page.getByRole('button', { name: 'Otwórz pokój' }).boundingBox();
    expect((corner?.x ?? 0) + (corner?.width ?? 0)).toBeLessThan(card?.x ?? 0);
  }

  // Main menu corner: opens on the intro, with the narrator's lines to read.
  await press(page.getByTestId('open-how-to'), touch);
  await expect(dialog.getByRole('heading', { name: 'Jak grać' })).toBeVisible();
  await expect(dialog.getByTestId('how-to-tab-intro')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('how-to-panel-intro').getByRole('listitem')).toHaveCount(11);
  await expectFits(page, dialog);

  // Stanowiska: ten tiles; one opens its help card, „Rozumiem” goes back to the grid.
  await press(dialog.getByTestId('how-to-tab-stations'), touch);
  const panel = dialog.getByTestId('how-to-panel-stations');
  await expect(panel.getByRole('listitem')).toHaveCount(10);
  await press(dialog.getByTestId('how-to-station-archive'), touch);
  const card = dialog.getByTestId('station-help-card');
  await expect(card).toHaveAttribute('data-kind', 'archive');
  await expect(card).toHaveAttribute('data-variant', 'full');
  await expect(card).toHaveAttribute('data-device', touch ? 'touch' : 'keyboard');
  await expectFits(page, dialog);
  await press(card.getByTestId('station-help-got'), touch);
  await expect(card).toHaveCount(0);
  await expect(dialog.getByTestId('how-to-station-archive')).toBeVisible();

  // Sterowanie: the bindings of the settings, without another „Jak grać?” inside.
  await press(dialog.getByTestId('how-to-tab-controls'), touch);
  await expect(dialog.getByTestId('controls-help')).toBeVisible();
  await expect(dialog.getByTestId('settings-how-to')).toHaveCount(0);
  await expectFits(page, dialog);
  await testInfo.attach(`how-to-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });

  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();

  // The keyboard: Esc on a station card goes back to the grid, a second Esc closes.
  if (!touch) {
    await page.getByTestId('open-how-to').click();
    await dialog.getByTestId('how-to-tab-stations').click();
    await dialog.getByTestId('how-to-station-phone').click();
    await expect(dialog.getByTestId('station-help-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog.getByTestId('station-help-card')).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  // Settings → Sterowanie → „Jak grać?”: it opens on top, and closing it returns to the settings.
  await press(page.getByRole('button', { name: 'Ustawienia' }), touch);
  const settings = page.getByRole('dialog', { name: 'Ustawienia' });
  await press(settings.getByRole('tab', { name: 'Sterowanie' }), touch);
  await press(settings.getByTestId('settings-how-to'), touch);
  await expect(dialog.getByRole('heading', { name: 'Jak grać' })).toBeVisible();
  await expectFits(page, dialog);
  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
  await expect(settings).toBeVisible();
  await press(settings.getByRole('button', { name: 'Gotowe' }), touch);
  await expect(settings).toBeHidden();

  // Lobby: a top action; the dialog closes by itself when the screen changes.
  await createRoom(host);
  await press(page.getByTestId('open-how-to'), touch);
  await expect(dialog.getByRole('heading', { name: 'Jak grać' })).toBeVisible();
  await expectFits(page, dialog);
  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
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

// S7-96: with a pad, Y walks the tabs, A opens a station, B goes back to the grid, then closes.
test('a pad switches tabs with Y and backs out with B', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad');
  const context = await browser.newContext(DESKTOP);
  trackContext(context);
  await context.addInitScript(installFakePad);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await page.getByTestId('open-how-to').click();
  const dialog = page.getByTestId('how-to-play');
  await expect(dialog.getByTestId('how-to-tab-intro')).toHaveAttribute('aria-pressed', 'true');

  await tapPad(page, 3);
  await expect(dialog.getByTestId('how-to-tab-stations')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('Y zmienia dział')).toBeVisible();

  // The focus follows the tab; down reaches the tile under it, A opens its card, B closes the
  // card only.
  await expect(dialog.getByTestId('how-to-tab-stations')).toBeFocused();
  await tapPad(page, 13);
  const tile = dialog.getByTestId('how-to-station-sourceRegistry');
  await expect(tile).toBeFocused();
  await tapPad(page, 0);
  await expect(dialog.getByTestId('station-help-card')).toHaveAttribute(
    'data-kind',
    'sourceRegistry',
  );
  await tapPad(page, 1);
  await expect(dialog.getByTestId('station-help-card')).toHaveCount(0);
  await expect(tile).toBeFocused();
  await tapPad(page, 1);
  await expect(dialog).toBeHidden();
});
