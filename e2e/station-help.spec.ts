import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, hideScene, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

type PadHook = { __pad: { press(i: number, down: boolean): void } };

const STATION_ID = 'help-imageSearch';

/** A fake standard gamepad whose buttons the test presses through `window.__pad`. */
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
  (window as unknown as PadHook).__pad = {
    press(i, down) {
      const button = buttons[i];
      if (button) {
        button.pressed = down;
        button.value = down ? 1 : 0;
      }
    },
  };
}

/** Opens a solo level with no station help seen yet. */
async function openLevel(
  browser: Browser,
  options: BrowserContextOptions,
  { pad = false } = {},
): Promise<Page> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => localStorage.setItem('redakcja.tutorial.done', '1'));
  if (pad) {
    await context.addInitScript(installFakePad);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  await createRoom({ page, nickname: 'Zośka', touch: options.hasTouch === true });
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL leaves little real time for the clock; the overlay needs no scene.
  await hideScene(page);
  return page;
}

/** Pins a Lupa obrazu this player operates in `phase`, with a folder lying on it. */
async function setStation(page: Page, phase: 'idle' | 'minigame', seed = 7): Promise<void> {
  await page.evaluate(
    ({ phase, id, seed }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      game.inject({
        stations: [
          {
            id,
            kind: 'imageSearch',
            operatorId: phase === 'minigame' ? game.localPlayerId() : null,
            phase,
            progressMs: 0,
            durationMs: 1000,
            minigameSeed: seed,
            lockoutMs: 0,
            outageMs: 0,
          },
        ],
        folders: [
          {
            id: 'f-help',
            spawnKey: 's0',
            storyId: 'l0-zalany-rynek',
            location: { kind: 'fixture', fixtureId: id },
            stamps: [],
            spawnedAtMs: 0,
            deadlineMs: 600_000,
            warned: false,
          },
        ],
      });
    },
    { phase, id: STATION_ID, seed },
  );
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** Whole seconds on the overlay clock („Zostało 12 s”). */
async function clockLeft(page: Page): Promise<number> {
  const label = (await page.getByTestId('station-clock').getAttribute('aria-label')) ?? '';
  return Number(label.match(/\d+/)?.[0] ?? Number.NaN);
}

/** True when the clock reads the same after `ms` of real time. */
async function clockStandsStill(page: Page, ms: number): Promise<boolean> {
  const before = await clockLeft(page);
  await page.waitForTimeout(ms);
  return (await clockLeft(page)) === before;
}

// S7-95: the first open of a station shows its help card over the minigame, the clock does not
// move while it is up, and the '?' in the header (H on a keyboard) brings it back.
test('first use shows the station help and the clock waits', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const options = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
  const page = await openLevel(browser, options);

  await setStation(page, 'minigame');
  const overlay = page.getByTestId('station-overlay');
  const card = overlay.getByTestId('station-help-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-kind', 'imageSearch');
  await expect(card).toHaveAttribute('data-variant', 'inPlay');
  await expect(card).toHaveAttribute('data-device', touch ? 'touch' : 'keyboard');
  // The minigame waits for „Rozumiem”; the full clock stands still.
  await expect(overlay.getByTestId('image-search')).toHaveCount(0);
  await expect(page.getByTestId('station-clock')).toHaveAttribute('aria-label', 'Zostało 20 s');
  expect(await clockStandsStill(page, 1500)).toBe(true);
  await expect(page.getByTestId('station-clock')).toHaveAttribute('aria-label', 'Zostało 20 s');
  // „Rozumiem” is on screen, down to 640×360, with no '?' while the card is up.
  const got = card.getByTestId('station-help-got');
  await expect(got).toBeInViewport();
  await expect(overlay.getByTestId('overlay-help')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('redakcja.stationHelp.v1')))
    .toBe('["imageSearch"]');
  await testInfo.attach(`station-help-first-use-${testInfo.project.name}.png`, {
    body: await page.screenshot({ scale: 'css' }),
    contentType: 'image/png',
  });

  if (touch) {
    await got.tap();
  } else {
    // Keyboard: „Rozumiem” has the focus; Enter closes the card, not the station.
    await expect(got).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await expect(card).toHaveCount(0);
  await expect(overlay.getByTestId('image-search')).toBeVisible();
  await expect.poll(() => clockLeft(page), { timeout: 10_000 }).toBeLessThan(20);

  // The '?' (H on a keyboard) brings the card back and stops the clock again.
  const help = overlay.getByTestId('overlay-help');
  await expect(help).toBeVisible();
  await expect(help).toHaveAccessibleName('Jak działa: Lupa obrazu');
  if (touch) {
    await help.tap();
  } else {
    await page.keyboard.press('KeyH');
  }
  await expect(card).toBeVisible();
  expect(await clockStandsStill(page, 1500)).toBe(true);
  if (touch) {
    await got.tap();
  } else {
    // Esc closes the card first; the station stays open.
    await page.keyboard.press('Escape');
  }
  await expect(card).toHaveCount(0);
  await expect(overlay).toBeVisible();
  if (!touch) {
    await help.click();
    await expect(card).toBeVisible();
    await page.keyboard.press('KeyH');
    await expect(card).toHaveCount(0);
  }

  // The next open of the same station goes straight to the minigame.
  await overlay.getByTestId('overlay-close').click();
  await expect(overlay).toHaveCount(0);
  await setStation(page, 'idle');
  await setStation(page, 'minigame', 8);
  await expect(overlay.getByTestId('image-search')).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('Select on a gamepad opens the station help, B closes it', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad on the desktop project');
  const page = await openLevel(browser, DESKTOP, { pad: true });
  const press = async (button: number) => {
    const set = (down: boolean) =>
      page.evaluate(({ b, d }) => (window as unknown as PadHook).__pad.press(b, d), {
        b: button,
        d: down,
      });
    await set(true);
    await page.waitForTimeout(150);
    await set(false);
    await page.waitForTimeout(150);
  };

  await setStation(page, 'minigame');
  const overlay = page.getByTestId('station-overlay');
  const card = overlay.getByTestId('station-help-card');
  await expect(card).toBeVisible();
  // A closes the first-use card and the pad becomes the device in use.
  await press(0);
  await expect(card).toHaveCount(0);
  await expect(overlay.getByTestId('image-search')).toBeVisible();
  // Select (8) reopens it for the pad, with „Rozumiem” ringed; B (1) closes the card only.
  await press(8);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-device', 'gamepad');
  await expect(card.getByTestId('station-help-got')).toHaveAttribute('data-focused', 'true');
  expect(await clockStandsStill(page, 1200)).toBe(true);
  await press(1);
  await expect(card).toHaveCount(0);
  await expect(overlay).toBeVisible();
  await expect(overlay.getByTestId('image-search')).toBeVisible();
});
