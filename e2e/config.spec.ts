import { type BrowserContextOptions, expect, type Page, test } from '@playwright/test';
import { closePlayers, DESKTOP, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

// The e2e project does not resolve workspace packages: the wire shape of `motdSchema` (shared).
type Motd = { id: string; text: string; tone: 'info' | 'warning' };

const INFO: Motd = {
  id: 'przerwa-2026-10',
  text: 'W piątek od 20:00 do 21:00 serwer ma przerwę techniczną - zagrajcie przed nią albo po niej.',
  tone: 'info',
};
const WARNING: Motd = { id: 'nowe-poziomy', text: 'Nowe poziomy już w grze!', tone: 'warning' };

/** A `publicConfigSchema` body with ads off. */
function publicConfig(motd: Motd | null) {
  return {
    revision: 1,
    siteOrigin: null,
    features: { roomBrowser: false, versus: true, spectators: true, intro: true },
    defaultDifficulty: 'normal',
    motd,
    ads: { enabled: false },
  };
}

/** Answers `GET /api/config` with this message from now on. */
async function serveMotd(page: Page, motd: Motd | null): Promise<void> {
  await page.unroute('**/api/config');
  await page.route('**/api/config', (route) => route.fulfill({ json: publicConfig(motd) }));
}

/** Loads the menu and waits until the client has the routed config and rendered it. */
async function openMenu(page: Page, reload: boolean): Promise<void> {
  const answered = page.waitForResponse('**/api/config');
  await (reload ? page.reload() : page.goto('/'));
  await answered;
  await expect(page.getByLabel('Twój podpis')).toBeVisible();
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

// S7-72: the operator's message of the day shows in the main menu with its tone; closing it
// survives a reload, and a message with a new id shows again. 640×360 on touch.
test('the message of the day shows, stays closed and returns with a new id', async ({
  browser,
}, testInfo) => {
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
  await serveMotd(page, INFO);
  await openMenu(page, false);

  const banner = page.getByRole('status', { name: 'Komunikat redakcji' });
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-tone', 'info');
  // Typeset: the spaced hyphen became an en dash.
  await expect(banner).toContainText('przerwę techniczną – zagrajcie');
  // Still one yellow action: the banner is not the main button.
  await expect(page.getByRole('button', { name: 'Otwórz pokój' })).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  const box = await banner.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
  const fontPx = await banner
    .locator('p')
    .evaluate((p) => Number.parseFloat(getComputedStyle(p).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(15);

  const close = page.getByRole('button', { name: 'Zamknij komunikat' });
  const closeBox = await close.boundingBox();
  expect(closeBox?.width ?? 0).toBeGreaterThanOrEqual(48);
  expect(closeBox?.height ?? 0).toBeGreaterThanOrEqual(48);
  if (touch) {
    await close.tap();
  } else {
    // Keyboard: Tab reaches the close button (after the corner buttons), Enter closes.
    for (let presses = 0; presses < 6; presses += 1) {
      await page.keyboard.press('Tab');
      if (await close.evaluate((element) => element === document.activeElement)) {
        break;
      }
    }
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(banner).toHaveCount(0);
  if (!touch) {
    // The keyboard focus moves on to the next control instead of falling back to the page.
    await expect(page.getByLabel('Twój podpis')).toBeFocused();
  }

  await openMenu(page, true);
  await expect(page.getByTestId('motd')).toHaveCount(0);

  await serveMotd(page, WARNING);
  await openMenu(page, true);
  await expect(banner).toBeVisible();
  await expect(banner).toHaveAttribute('data-tone', 'warning');
  await expect(banner).toContainText('Nowe poziomy już w grze!');
});

test('without a message there is no banner', async ({ page }) => {
  await serveMotd(page, null);
  await openMenu(page, false);
  await expect(page.getByTestId('motd')).toHaveCount(0);
});
