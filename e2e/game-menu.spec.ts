import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  avatarPositions,
  closePlayers,
  createRoom,
  DESKTOP,
  moveRight,
  PHONE,
  type Player,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

const HIDE_CANVAS = 'canvas { display: none !important; }';

type Hook = { getState(): { elapsedMs: number; paused: boolean } };

/** A fake standard gamepad whose Start button (9) the test presses through `window.__pad`. */
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

async function openSolo(
  browser: Browser,
  options: BrowserContextOptions,
  { tutorialDone = true, pad = false } = {},
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((done) => {
    if (done) {
      localStorage.setItem('redakcja.tutorial.done', '1');
    }
  }, tutorialDone);
  if (pad) {
    await context.addInitScript(installFakePad);
  }
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const player = { page, nickname: 'Zośka', touch: options.hasTouch === true };
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect.poll(() => elapsed(page)).toBeGreaterThan(0);
  return player;
}

function gameState(page: Page): Promise<{ elapsedMs: number; paused: boolean }> {
  return page.evaluate(() => (window as unknown as { __game: Hook }).__game.getState());
}

async function elapsed(page: Page): Promise<number> {
  return (await gameState(page)).elapsedMs;
}

/** Every button of the open sheet lies fully inside the viewport. */
async function expectSheetInViewport(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('no viewport');
  }
  const boxes = await page
    .getByTestId('game-menu')
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, h: r.height };
      }),
    );
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
    expect(box.bottom).toBeLessThanOrEqual(viewport.height);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
}

test('Esc opens the menu after the tutorial skip, pauses a solo level and freezes movement', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const { page } = await openSolo(browser, DESKTOP, { tutorialDone: false });
  const menu = page.getByTestId('game-menu');

  // The tutorial card owns the first Esc: it skips the tutorial and does not open the menu.
  await expect(page.getByRole('button', { name: 'Pomiń samouczek' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Pomiń samouczek' })).toBeHidden();
  await expect(menu).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId('game-menu-status')).toHaveText('Pauza');
  await expect(menu.getByRole('button', { name: 'Wróć do gry' })).toBeFocused();
  await expect(menu.getByTestId('game-menu-room')).toHaveText(/^Pokój [A-Z]{4}$/);
  await expect.poll(async () => (await gameState(page)).paused).toBe(true);
  await expectSheetInViewport(page);

  // The level clock stands still and the avatar does not walk while the sheet is open.
  const frozenAt = await elapsed(page);
  const before = (await avatarPositions({ page, nickname: 'Zośka', touch: false })).Zośka;
  await moveRight({ page, nickname: 'Zośka', touch: false }, 600);
  expect(await elapsed(page)).toBe(frozenAt);
  const after = (await avatarPositions({ page, nickname: 'Zośka', touch: false })).Zośka;
  expect(after?.x).toBeCloseTo(before?.x ?? 0, 3);

  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect.poll(async () => (await gameState(page)).paused).toBe(false);
  await expect.poll(() => elapsed(page)).toBeGreaterThan(frozenAt);
});

test('a pad Start press toggles the menu', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad');
  const { page } = await openSolo(browser, DESKTOP, { pad: true });
  const menu = page.getByTestId('game-menu');
  const press = (down: boolean) =>
    page.evaluate(
      (down) =>
        (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad.press(
          9,
          down,
        ),
      down,
    );

  await press(true);
  await expect(menu).toBeVisible();
  // Held down it does nothing more; the next press closes the sheet.
  await page.waitForTimeout(200);
  await expect(menu).toBeVisible();
  await press(false);
  await press(true);
  await expect(menu).toBeHidden();
  await press(false);
  await expect.poll(async () => (await gameState(page)).paused).toBe(false);
});

test('the menu button opens the sheet; leaving needs two presses', async ({
  browser,
}, testInfo) => {
  const options = testInfo.project.name === 'mobile' ? PHONE : DESKTOP;
  const { page } = await openSolo(browser, options);
  const menu = page.getByTestId('game-menu');
  const button = page.getByTestId('game-menu-button');

  const box = await button.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);

  await button.click();
  await expect(menu).toBeVisible();
  await expectSheetInViewport(page);
  await menu.getByRole('button', { name: 'Wróć do gry' }).click();
  await expect(menu).toBeHidden();

  await button.click();
  // Software WebGL draws a frame every half second here; the two presses must land within
  // 3 s of each other and need no scene.
  await page.addStyleTag({ content: HIDE_CANVAS });
  const leave = menu.getByTestId('game-menu-leave');
  await leave.click();
  await expect(leave).toHaveText('Na pewno? Wyjdź');
  // The confirming press from the keyboard: a click's actionability checks can take seconds
  // on a software-rendered page, past the 3 s window.
  await leave.press('Enter');
  await expect(page.getByRole('heading', { name: 'Redakcja na Ostatnią Chwilę' })).toBeVisible();
});

test('the sheet fits a 640×360 phone', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  const { page } = await openSolo(browser, { ...PHONE, viewport: { width: 640, height: 360 } });
  await page.getByTestId('game-menu-button').click();
  const menu = page.getByTestId('game-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Wróć do gry' })).toBeVisible();
  await expectSheetInViewport(page);
  // A tap beside the sheet closes it, as on the menu button.
  await page.mouse.click(40, 300);
  await expect(menu).toBeHidden();
});
