import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, joinRoom, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

// Every other spec starts with the intro seen (playwright.config.ts); this one starts fresh.
test.use({ storageState: { cookies: [], origins: [] } });

const SEEN_KEY = 'redakcja.intro.seen.v1';

/** The later scenes' kit art, in scene order (intro-script.ts). */
const KIT_SCENES = [
  ['proof', 'proofCards'],
  ['credibility', 'hudPill'],
  ['roles', 'roleAbility'],
  ['team', 'teamBubbles'],
  ['end', 'kolegium'],
] as const;

/** Taps on touch projects, clicks on desktop. */
async function press(locator: Locator, touch: boolean): Promise<void> {
  await (touch ? locator.tap() : locator.click());
}

/** 640×360 on the touch projects, 1366×768 on desktop. */
function contextOptions(touch: boolean): BrowserContextOptions {
  return touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
}

type Opened = { page: Page; nickname: string; touch: boolean };

/**
 * A fresh browser on the front page with the nickname filled in. `intro` sets the operator's
 * 'intro' feature flag through a routed `GET /api/config`; without it the server's config is used.
 */
async function open(
  browser: Browser,
  nickname: string,
  touch: boolean,
  intro?: boolean,
): Promise<Opened> {
  const context = await browser.newContext(contextOptions(touch));
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      throw new Error(`console error: ${message.text()}`);
    }
  });
  page.on('request', (request) => {
    if (/\/assets\/voice\//.test(new URL(request.url()).pathname)) {
      throw new Error(`asked for the voice this build does not ship: ${request.url()}`);
    }
  });
  if (intro !== undefined) {
    // The server's own config with only the flag changed, so new fields never go stale here.
    await page.route('**/api/config', async (route) => {
      const response = await route.fetch();
      const json = await response.json();
      await route.fulfill({ response, json: { ...json, features: { ...json.features, intro } } });
    });
  }
  const config = page.waitForResponse('**/api/config');
  await page.goto('/?debug');
  await config;
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch };
}

function seenFlag(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), SEEN_KEY);
}

// S7-102: a player who has never watched the intro gets it on their own in a new training room —
// „Jak grać” without its tabs, subtitles on, no voice file asked for. „Pomiń” closes it and marks
// it seen, so the next room does not play it; a guest joining a training room gets it too. The
// main menu's „Jak grać?” replays it.
test('a new training room autoplays the intro once; Pomiń marks it seen', async ({
  browser,
}, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const host = await open(browser, 'Naczelna', touch);
  const { page } = host;
  const dialog = page.getByTestId('how-to-play');
  const player = dialog.getByTestId('intro-player');

  await createRoom(host);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await expect(dialog.getByTestId('intro-subtitle')).toContainText('Witaj w redakcji');
  await expect(dialog.getByTestId('how-to-tab-intro')).toHaveCount(0);
  await expect(dialog.getByTestId('intro-next')).toBeFocused();
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  await testInfo.attach(`intro-autoplay-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(await seenFlag(page)).toBeNull();

  await press(dialog.getByTestId('intro-skip'), touch);
  await expect(dialog).toBeHidden();
  expect(await seenFlag(page)).toBe('1');
  await expect(page.getByTestId('room-code')).toBeVisible();

  // A guest who has not seen it watches it in the same training room; the host does not again.
  const code = (await page.getByTestId('room-code').textContent()) ?? '';
  const guest = await open(browser, 'Stażysta', touch);
  await joinRoom(guest, code, { ready: false });
  const guestPlayer = guest.page.getByTestId('how-to-play').getByTestId('intro-player');
  await expect(guestPlayer).toHaveAttribute('data-scene', 'welcome');
  // Esc (or B) skips it, as Pomiń does.
  if (!touch) {
    await guest.page.keyboard.press('Escape');
  } else {
    await press(guest.page.getByTestId('intro-skip'), touch);
  }
  await expect(guest.page.getByTestId('how-to-play')).toBeHidden();
  expect(await seenFlag(guest.page)).toBe('1');
  await expect(dialog).toBeHidden();

  // A second room: no autoplay any more.
  await press(page.getByRole('button', { name: 'Wyjdź' }), touch);
  await createRoom(host);
  await page.waitForTimeout(1000);
  await expect(dialog).toBeHidden();

  // The main menu's „Jak grać?” plays it again from the start, with its tabs.
  await press(page.getByRole('button', { name: 'Wyjdź' }), touch);
  await press(page.getByTestId('open-how-to'), touch);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  // With its tabs (a landscape phone hides the bar while the intro plays, S7-101).
  await expect(dialog.getByTestId('how-to-tab-intro')).toHaveCount(1);
  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
});

// S7-102: scenes 7–11 are drawn from the UI kit; the last scene's „Do roboty!” finishes the
// intro, which closes the lobby's autoplay and marks it seen. Settings → Ułatwienia „Obejrzyj
// wprowadzenie” replays it over the settings.
test('the intro finishes through its kit scenes; the settings replay it', async ({
  browser,
}, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const host = await open(browser, 'Naczelny', touch);
  const { page } = host;
  const dialog = page.getByTestId('how-to-play');
  const player = dialog.getByTestId('intro-player');

  await createRoom(host);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  // Dalej scene by scene. Scenes also move on by themselves, so count by index.
  let index = 0;
  while (index < 6) {
    await press(dialog.getByTestId('intro-next'), touch);
    await expect(player).not.toHaveAttribute('data-index', String(index));
    index = Number(await player.getAttribute('data-index'));
  }
  // Pause on each kit scene to check its art, then go on.
  await press(dialog.getByTestId('intro-pause'), touch);
  await expect(player).toHaveAttribute('data-paused', 'true');
  while (Number(await player.getAttribute('data-index')) > 6) {
    await press(dialog.getByTestId('intro-prev'), touch);
  }
  for (const [scene, art] of KIT_SCENES) {
    await expect(player).toHaveAttribute('data-scene', scene);
    if (!(await player.getAttribute('data-paused'))) {
      await press(dialog.getByTestId('intro-pause'), touch);
    }
    const drawn = dialog.locator(`[data-art="${art}"]`);
    await expect(drawn).toBeVisible();
    const stage = await dialog.getByTestId('intro-stage').boundingBox();
    const artBox = await drawn.boundingBox();
    // The art fits the stage, also in the ~150 px of a 640×360 phone.
    expect(artBox?.height ?? 0).toBeLessThanOrEqual((stage?.height ?? 0) + 1);
    expect(artBox?.width ?? 0).toBeLessThanOrEqual((stage?.width ?? 0) + 1);
    // …and stays clear of the progress dots.
    const dots = await dialog.getByTestId('intro-dots').boundingBox();
    expect((artBox?.y ?? 0) + (artBox?.height ?? 0)).toBeLessThanOrEqual((dots?.y ?? 0) + 1);
    await testInfo.attach(`intro-${scene}-${testInfo.project.name}.png`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    if (scene !== 'end') {
      await press(dialog.getByTestId('intro-next'), touch);
    }
  }
  await expect(dialog.getByTestId('intro-next')).toHaveText('Do roboty!');
  expect(await seenFlag(page)).toBeNull();
  await press(dialog.getByTestId('intro-next'), touch);
  await expect(dialog).toBeHidden();
  expect(await seenFlag(page)).toBe('1');

  // Settings → Ułatwienia → „Obejrzyj wprowadzenie”: over the settings, seen or not.
  await press(page.getByRole('button', { name: 'Ustawienia' }), touch);
  const settings = page.getByRole('dialog', { name: 'Ustawienia' });
  await press(settings.getByRole('tab', { name: 'Ułatwienia' }), touch);
  await press(settings.getByTestId('settings-intro'), touch);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await press(dialog.getByTestId('intro-skip'), touch);
  // Replayed from the settings, the end is the „Koniec wprowadzenia” card, not a closed dialog.
  await expect(dialog.getByTestId('intro-end')).toBeVisible();
  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
  await expect(settings).toBeVisible();
});

// S7-102: with the operator's 'intro' flag off nothing plays on its own, the settings have no
// replay and „Jak grać” has no Wprowadzenie tab.
test('with the intro flag off there is no autoplay', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const host = await open(browser, 'Wydawca', touch, false);
  const { page } = host;

  await createRoom(host);
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('how-to-play')).toBeHidden();
  expect(await seenFlag(page)).toBeNull();

  await press(page.getByRole('button', { name: 'Ustawienia' }), touch);
  const settings = page.getByRole('dialog', { name: 'Ustawienia' });
  await press(settings.getByRole('tab', { name: 'Ułatwienia' }), touch);
  await expect(settings.getByRole('button', { name: 'Pokaż samouczek jeszcze raz' })).toBeVisible();
  await expect(settings.getByTestId('settings-intro')).toHaveCount(0);
  await press(settings.getByRole('button', { name: 'Gotowe' }), touch);
  await expect(settings).toBeHidden();

  // „Jak grać?” opens on its stations: no Wprowadzenie tab.
  await press(page.getByTestId('open-how-to'), touch);
  const dialog = page.getByTestId('how-to-play');
  await expect(dialog.getByTestId('how-to-panel-stations')).toBeVisible();
  await expect(dialog.getByTestId('how-to-tab-intro')).toHaveCount(0);
  await expect(dialog.getByTestId('intro-player')).toHaveCount(0);
});
