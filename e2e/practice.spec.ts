// S7-97: „Wypróbuj” — every station's minigame plays from its card in „Jak grać”, out of play,
// with no server (no WebSocket is ever opened from the main menu) and no score, on desktop
// (1366×768) and on the smallest landscape phone (640×360, touch). In a match the in-game menu's
// „Pomoc: stanowiska” opens the same cards with practice off.
import { expect, type Locator, type Page, test, type WebSocketRoute } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

/** Every station kind, in the tab's order (e2e cannot import workspaces). */
const STATION_KINDS = [
  'imageSearch',
  'archive',
  'sourceRegistry',
  'phone',
  'aiScanner',
  'dataLibrary',
  'geolocation',
  'transcript',
  'crossCheck',
  'metadata',
] as const;

/** Taps on touch projects, clicks on desktop. */
async function press(locator: Locator, touch: boolean): Promise<void> {
  await (touch ? locator.tap() : locator.click());
}

/** The element sits inside the viewport and the page never scrolls sideways. */
async function expectFits(page: Page, element: Locator): Promise<void> {
  const viewport = page.viewportSize();
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('every station plays a practice round from its card, with no server', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext({
    ...(touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP),
    reducedMotion: 'reduce',
  });
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  const sockets: string[] = [];
  page.on('websocket', (socket) => sockets.push(socket.url()));
  await page.goto('/');

  const dialog = page.getByTestId('how-to-play');
  await press(page.getByTestId('open-how-to'), touch);
  await press(dialog.getByTestId('how-to-tab-stations'), touch);

  for (const kind of STATION_KINDS) {
    await press(dialog.getByTestId(`how-to-station-${kind}`), touch);
    const card = dialog.getByTestId('station-help-card');
    await expect(card).toHaveAttribute('data-kind', kind);
    await expect(dialog.getByTestId('how-to-practice-off')).toHaveCount(0);
    await press(card.getByTestId('how-to-practice'), touch);

    const practice = dialog.getByTestId('practice');
    await expect(practice).toHaveAttribute('data-kind', kind);
    await expect(practice).toHaveAttribute('data-state', 'playing');
    await expect(practice.getByTestId('practice-clock')).toBeVisible();
    // The minigame itself rendered inside the frame (its key hints, for the device in use).
    await expect(practice.getByTestId('key-hints').first()).toHaveAttribute(
      'data-device',
      touch ? 'touch' : 'keyboard',
    );
    await expectFits(page, practice.getByTestId('practice-round'));
    await page.screenshot({ path: testInfo.outputPath(`practice-${kind}.png`), scale: 'css' });

    // ✗ goes back to the card, „Rozumiem” to the grid.
    await press(practice.getByTestId('overlay-close'), touch);
    await expect(practice).toHaveCount(0);
    await expect(card).toHaveAttribute('data-kind', kind);
    await press(card.getByTestId('station-help-got'), touch);
    await expect(card).toHaveCount(0);
  }

  // A solved round shows „Udało się!”; „Jeszcze raz” deals the next story, „Wróć” the card.
  await press(dialog.getByTestId('how-to-station-metadata'), touch);
  await press(dialog.getByTestId('how-to-practice'), touch);
  const practice = dialog.getByTestId('practice');
  const story = await practice.getAttribute('data-story');
  const game = practice.getByTestId('metadata');
  const answer = (await game.getAttribute('data-answer')) ?? '';
  await press(game.getByTestId(`metadata-${answer}`), touch);
  const result = practice.getByTestId('practice-result');
  await expect(result).toHaveAttribute('data-success', 'true');
  await expect(result).toContainText('Udało się!');
  await expectFits(page, practice.getByTestId('practice-round'));
  await testInfo.attach(`practice-result-${testInfo.project.name}.png`, {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await press(result.getByTestId('practice-again'), touch);
  await expect(practice).toHaveAttribute('data-state', 'playing');
  await expect(practice).toHaveAttribute('data-attempt', '1');
  expect(await practice.getAttribute('data-story')).not.toBe(story);
  await press(practice.getByTestId('overlay-close'), touch);
  await expect(dialog.getByTestId('station-help-card')).toHaveAttribute('data-kind', 'metadata');

  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
  // Practice never talked to the server: the main menu opened no connection at all.
  expect(sockets).toEqual([]);
});

test('keys drive the practice round; Esc goes back to the card', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const context = await browser.newContext(DESKTOP);
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  const dialog = page.getByTestId('how-to-play');
  await page.getByTestId('open-how-to').click();
  await dialog.getByTestId('how-to-tab-stations').click();
  await dialog.getByTestId('how-to-station-phone').click();

  // The card's yellow „Wypróbuj” has the focus: Enter starts the round.
  const start = dialog.getByTestId('how-to-practice');
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  const practice = dialog.getByTestId('practice');
  await expect(practice).toHaveAttribute('data-state', 'playing');

  // The arrows reach the minigame: the Telefon's cursor leaves the first contact.
  const first = practice.getByTestId('phone-contact-0');
  await expect(first).toHaveAttribute('data-focused', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(first).toHaveAttribute('data-focused', 'false');

  // Tab (the minigame's `alt`) and H (station help) never leave the round or switch the tab.
  await page.keyboard.press('Tab');
  await page.keyboard.press('KeyH');
  await expect(practice).toHaveAttribute('data-state', 'playing');

  // Esc: back to the card with „Wypróbuj” focused; a second Esc to the grid, a third closes.
  await page.keyboard.press('Escape');
  await expect(practice).toHaveCount(0);
  await expect(start).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByTestId('station-help-card')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('in a match the menu opens the station help with practice off', async ({
  browser,
}, testInfo) => {
  // The 3D level renders on the CPU in CI and sandboxes: slow, so give it time.
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const player = await openPlayer(
    browser,
    'Zośka',
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  const { page } = player;
  await page.evaluate(() => localStorage.setItem('redakcja.tutorial.done', '1'));
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 30_000 });

  await press(page.getByRole('button', { name: 'Menu' }), touch);
  const menu = page.getByTestId('game-menu');
  const help = menu.getByTestId('game-menu-help');
  await expect(help).toHaveText('Pomoc: stanowiska');
  // Every button of the sheet, the new row included, stays on screen and a full target.
  const viewport = page.viewportSize();
  const boxes = await menu.getByRole('button').evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(5);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect(box.bottom).toBeLessThanOrEqual(viewport?.height ?? 0);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('game-menu.png'), scale: 'css' });
  await press(help, touch);

  const dialog = page.getByTestId('how-to-play');
  await expect(dialog.getByTestId('how-to-tab-stations')).toHaveAttribute('aria-pressed', 'true');
  await press(dialog.getByTestId('how-to-station-phone'), touch);
  const card = dialog.getByTestId('station-help-card');
  await expect(card).toHaveAttribute('data-kind', 'phone');
  await expect(card.getByTestId('how-to-practice')).toHaveCount(0);
  await expect(dialog.getByTestId('how-to-practice-off')).toHaveText('Ćwiczenia po wydaniu');
  await expectFits(page, dialog);

  // Closing the help returns to the menu, still open over the level.
  await press(dialog.getByTestId('how-to-close'), touch);
  await expect(dialog).toBeHidden();
  await expect(menu).toBeVisible();
});

test('a briefing station chip opens its card; the level start closes the help', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext(
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.addInitScript(() => localStorage.setItem('redakcja.tutorial.done', '1'));
  // The e2e server's briefing lasts 1.5 s: hold back the room state that starts the level, so
  // the briefing stays up while the help is used, then let it through.
  let holding = true;
  const held: string[] = [];
  const pages: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    pages.push(ws);
    const server = ws.connectToServer();
    server.onMessage((message) => {
      const text = typeof message === 'string' ? message : message.toString();
      const parsed = JSON.parse(text) as { type?: string; phase?: string };
      if (holding && parsed.type === 'roomState' && parsed.phase === 'playing') {
        held.push(text);
      } else {
        ws.send(message);
      }
    });
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  await createRoom({ page, nickname: 'Zośka', touch });
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('briefing')).toBeVisible();

  const chip = page.locator('[data-testid^="briefing-station-"]').first();
  const kind = ((await chip.getAttribute('data-testid')) ?? '').replace('briefing-station-', '');
  expect(kind).not.toBe('');
  const chipBox = await chip.boundingBox();
  expect(chipBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await press(chip, touch);

  const dialog = page.getByTestId('how-to-play');
  await expect(dialog.getByTestId('how-to-tab-stations')).toHaveAttribute('aria-pressed', 'true');
  const card = dialog.getByTestId('station-help-card');
  await expect(card).toHaveAttribute('data-kind', kind);
  // Out of play: the card offers practice, and its yellow „Wypróbuj” has the focus.
  await expect(card.getByTestId('how-to-practice')).toBeVisible();
  if (!touch) {
    await expect(card.getByTestId('how-to-practice')).toBeFocused();
  }
  await expectFits(page, dialog);
  await page.screenshot({ path: testInfo.outputPath('briefing-help.png'), scale: 'css' });
  // The briefing stays under the help, its „Gotowy!” untouched.
  await expect(page.getByTestId('briefing')).toBeVisible();

  // The level starts: the help closes by itself, so it never hides the newsroom.
  holding = false;
  for (const message of held.splice(0)) {
    pages.at(-1)?.send(message);
  }
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: 30_000 });
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

/** Presses and releases one pad button (standard mapping: 0 A, 1 B, 3 Y, 8 Select). */
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

test('a pad starts a practice round with A and leaves it with B', async ({ browser }, testInfo) => {
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
  await dialog.getByTestId('how-to-tab-stations').click();
  await dialog.getByTestId('how-to-station-crossCheck').click();
  await expect(dialog.getByTestId('how-to-practice')).toBeFocused();

  await tapPad(page, 0);
  const practice = dialog.getByTestId('practice');
  await expect(practice).toHaveAttribute('data-state', 'playing');
  await expect(practice.getByTestId('key-hints').first()).toHaveAttribute('data-device', 'gamepad');

  // Y is the minigame's own `alt` and Select (station help) does nothing: the round stays, and
  // the dialog keeps its tab.
  await tapPad(page, 3);
  await tapPad(page, 8);
  await expect(practice).toHaveAttribute('data-state', 'playing');

  await tapPad(page, 1);
  await expect(practice).toHaveCount(0);
  await expect(dialog.getByTestId('station-help-card')).toHaveAttribute('data-kind', 'crossCheck');
  await expect(dialog.getByTestId('how-to-tab-stations')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('how-to-practice')).toBeFocused();
});
