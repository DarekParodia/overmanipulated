import { expect, type Locator, type Page, test } from '@playwright/test';
import { closePlayers, DESKTOP, openPlayer, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

/** Taps on touch projects, clicks on desktop. */
async function press(locator: Locator, touch: boolean): Promise<void> {
  await (touch ? locator.tap() : locator.click());
}

/** Console errors and any request for the intro voice, which this build does not ship. */
function watchNoise(page: Page): string[] {
  const noise: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      noise.push(message.text());
    }
  });
  page.on('request', (request) => {
    if (/\/assets\/voice\//.test(new URL(request.url()).pathname)) {
      noise.push(`request ${request.url()}`);
    }
  });
  return noise;
}

// S7-101: „Jak grać” → Wprowadzenie plays the narrated intro. Without a recorded voice it runs on
// subtitles and fallback timing, asks for no voice file and logs no error; the gameplay scenes
// render the local sim through the game's own renderer; Wstecz, Pauza, Dalej and Pomiń work by
// touch and mouse at 1366×768 and 640×360.
test('the intro plays its scenes in-engine, silently, with its controls', async ({
  browser,
}, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const host = await openPlayer(
    browser,
    'Widz',
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  const { page } = host;
  const noise = watchNoise(page);
  const dialog = page.getByTestId('how-to-play');
  const player = dialog.getByTestId('intro-player');
  const subtitle = dialog.getByTestId('intro-subtitle');

  await press(page.getByTestId('open-how-to'), touch);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await expect(player).toHaveAttribute('data-voice', 'off');
  await expect(subtitle).toContainText('Witaj w redakcji Kuriera Nowobrzeskiego!');
  // The yellow „Dalej” is the one main action; „Gotowe” steps back while the intro plays.
  await expect(dialog.getByTestId('intro-next')).toHaveText('Dalej');
  await expect(dialog.getByTestId('how-to-close')).not.toHaveCSS(
    'background-color',
    await dialog.getByTestId('intro-next').evaluate((el) => getComputedStyle(el).backgroundColor),
  );

  // The welcome scene moves on by itself after its reading time (6.4 s). Software GL in CI draws
  // the newsroom at a few frames per second and the first frame compiles the scene, so the test
  // pauses first and then steps to the conveyor with Wstecz, pausing again at once.
  await expect(player).not.toHaveAttribute('data-scene', 'welcome', { timeout: 15_000 });
  await press(dialog.getByTestId('intro-pause'), touch);
  await expect(player).toHaveAttribute('data-paused', 'true');
  await expect(dialog.getByTestId('intro-pause')).toHaveText('Wznów');
  if (Number(await player.getAttribute('data-index')) > 1) {
    // Wstecz plays a scene from its start and lifts the pause, so pause again at the conveyor.
    while (Number(await player.getAttribute('data-index')) > 1) {
      await press(dialog.getByTestId('intro-prev'), touch);
    }
    await press(dialog.getByTestId('intro-pause'), touch);
  }
  await expect(player).toHaveAttribute('data-paused', 'true');
  await expect(player).toHaveAttribute('data-scene', 'folders');
  await expect(dialog.getByTestId('intro-engine').locator('canvas')).toBeVisible();
  // The „Następna teczka” card counts down to the folder the local sim will spawn.
  await expect(dialog.getByTestId('hud-next')).toBeVisible();
  await expect(subtitle).not.toBeEmpty();
  const stage = await dialog.getByTestId('intro-stage').boundingBox();
  expect(stage?.height ?? 0).toBeGreaterThanOrEqual(touch ? 140 : 300);
  await testInfo.attach(`intro-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  // Pauza holds the scene.
  await page.waitForTimeout(1000);
  await expect(player).toHaveAttribute('data-scene', 'folders');

  // Wstecz goes back a scene (and lifts the pause); Wznów lets a paused scene run on.
  await press(dialog.getByTestId('intro-prev'), touch);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await expect(player).not.toHaveAttribute('data-paused', 'true');
  await press(dialog.getByTestId('intro-pause'), touch);
  await expect(player).toHaveAttribute('data-paused', 'true');
  await press(dialog.getByTestId('intro-pause'), touch);
  await expect(player).not.toHaveAttribute('data-paused', 'true');
  await expect(dialog.getByTestId('intro-pause')).toHaveText('Pauza');

  // Dalej on to the stations: the stamp lands on the photo. Each press moves one scene on; a
  // slow software-GL frame may let a short scene run out by itself on the way, so count by index.
  let index = Number(await player.getAttribute('data-index'));
  while (index < 4) {
    await press(dialog.getByTestId('intro-next'), touch);
    await expect(player).not.toHaveAttribute('data-index', String(index));
    index = Number(await player.getAttribute('data-index'));
  }
  await expect(player).toHaveAttribute('data-scene', 'stations');
  await expect(dialog.getByTestId('intro-proof')).toBeVisible({ timeout: 8000 });

  // Pomiń: the end card offers a replay, which starts again from the welcome.
  await press(dialog.getByTestId('intro-skip'), touch);
  await expect(dialog.getByTestId('intro-end')).toBeVisible();
  await press(dialog.getByTestId('intro-replay'), touch);
  await expect(player).toHaveAttribute('data-scene', 'welcome');

  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  expect(noise).toEqual([]);
});

// Keyboard: → / ← move between scenes, Space pauses, Esc skips to the end card, a second Esc closes.
test('the intro answers the keyboard', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const { page } = await openPlayer(browser, 'Klawisz', DESKTOP);
  const dialog = page.getByTestId('how-to-play');
  const player = dialog.getByTestId('intro-player');
  await page.getByTestId('open-how-to').click();
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await expect(dialog.getByTestId('intro-next')).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(player).toHaveAttribute('data-scene', 'folders');
  await page.keyboard.press('Space');
  await expect(player).toHaveAttribute('data-paused', 'true');
  await page.keyboard.press('Space');
  await expect(player).not.toHaveAttribute('data-paused', 'true');
  // Space on the focused „Dalej” only paused: the scene is the same.
  await expect(player).toHaveAttribute('data-scene', 'folders');
  await page.keyboard.press('ArrowLeft');
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  // Enter on the focused „Dalej” goes on once, not twice.
  await page.keyboard.press('Enter');
  await expect(player).toHaveAttribute('data-scene', 'folders');

  await page.keyboard.press('Escape');
  await expect(dialog.getByTestId('intro-end')).toBeVisible();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
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

/** Presses and releases one pad button (0 A, 1 B, 2 X, 14 d-pad left, 15 d-pad right). */
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
    // Polled once per animation frame: wait until two frames saw the new state.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.waitForTimeout(120);
  }
}

// Gamepad: d-pad right / A go on, d-pad left back, X pauses, B skips, a second B closes.
test('the intro answers a gamepad', async ({ browser }, testInfo) => {
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
  const player = dialog.getByTestId('intro-player');
  await expect(player).toHaveAttribute('data-scene', 'welcome');

  // On the welcome (no renderer, so the pad is polled at full speed).
  await tapPad(page, 2);
  await expect(player).toHaveAttribute('data-paused', 'true');
  await tapPad(page, 2);
  await expect(player).not.toHaveAttribute('data-paused', 'true');
  // Under load the welcome's 6.4 s may have run out by now: d-pad left comes back to it and
  // plays it from its start, so every step below starts on a fresh scene clock.
  while (Number(await player.getAttribute('data-index')) > 0) {
    await tapPad(page, 14);
  }
  await tapPad(page, 14);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await tapPad(page, 15);
  await expect(player).toHaveAttribute('data-scene', 'folders');
  await tapPad(page, 14);
  await expect(player).toHaveAttribute('data-scene', 'welcome');
  await tapPad(page, 0);
  await expect(player).toHaveAttribute('data-scene', 'folders');
  await tapPad(page, 1);
  await expect(dialog.getByTestId('intro-end')).toBeVisible();
  await tapPad(page, 1);
  await expect(dialog).toBeHidden();
});

// Reduced motion: a scene only fades in (no pop), with the system setting as with the game's own.
test('the intro only fades with reduced motion', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one layout is enough');
  const { page } = await openPlayer(browser, 'Spokojna', DESKTOP);
  const art = page.getByTestId('intro-stage').locator('[data-kind="kit"]');
  const animation = () => art.evaluate((el) => getComputedStyle(el).animationName);
  await page.getByTestId('open-how-to').click();
  expect(await animation()).toContain('scene-in');
  await page.getByTestId('how-to-close').click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByTestId('open-how-to').click();
  expect(await animation()).toContain('scene-fade');
});
