// S7-104: the local profile. A real solo match on the game server feeds it — the verdicts and the
// level end are injected into the live socket, so they go through the client's real session and
// event routing — and the „Profil” dialog in a new tab shows the counts. The dialog works with
// touch at 640×360 and with the keyboard at 1366×768; the look and the reset persist.
import { type Browser, expect, type Locator, type Page, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  PHONE,
  type Player,
  pickRole,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

const SMALL_PHONE = { ...PHONE, viewport: { width: 640, height: 360 } };

function verdict(playerId: string, folderId: string, outcome: 'correct' | 'wrong') {
  return {
    kind: 'verdictResult',
    playerId,
    verdict: 'reject',
    folderId,
    spawnKey: `s${folderId.replace(/\D/g, '')}`,
    storyId: 'l0-zalany-rynek',
    outcome,
    reason: outcome === 'correct' ? 'correctNormal' : 'rejectedTrue',
    scoreDelta: outcome === 'correct' ? 10 : -10,
    credibilityDelta: 0,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

const LEVEL_END = {
  type: 'levelEnd',
  levelId: 'l0-greybox',
  difficulty: 'normal',
  won: true,
  stars: 1,
  score: 10,
  credibility: 50,
  results: [],
  lossReason: null,
  starThresholds: { two: 120, three: 190 },
  maxScore: 240,
};

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

async function openProfile(page: Page, touch: boolean): Promise<Locator> {
  await press(page.getByTestId('open-profile'), touch);
  const dialog = page.getByTestId('profile');
  await expect(dialog.getByRole('heading', { name: 'Profil' })).toBeVisible();
  return dialog;
}

function stat(dialog: Locator, id: string): Locator {
  return dialog.locator(`[data-stat="${id}"] dd`);
}

/** A solo player whose socket the test can speak into as the server. */
async function openWired(browser: Browser, touch: boolean) {
  const context = await browser.newContext(touch ? SMALL_PHONE : DESKTOP);
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  const sockets: { send(message: string): void }[] = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    ws.connectToServer();
    sockets.push(ws);
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Kronikarka');
  const player: Player = { page, nickname: 'Kronikarka', touch };
  return {
    context,
    page,
    player,
    toPage: (message: object) => {
      const socket = sockets.at(-1);
      expect(socket).toBeDefined();
      socket?.send(JSON.stringify(message));
    },
  };
}

test('a real match updates the profile; reset clears it', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const { context, page, player, toPage } = await openWired(browser, touch);

  // Empty to begin with.
  let dialog = await openProfile(page, touch);
  await expect(stat(dialog, 'levels')).toHaveText('0');
  await expect(stat(dialog, 'accuracy')).toHaveText('–');
  await press(dialog.getByTestId('profile-close'), touch);
  await expect(dialog).not.toBeVisible();

  await createRoom(player);
  await pickRole(player, 'Archiwista');
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();

  const playerId = await page.evaluate(
    () =>
      (
        window as unknown as { __fx: { useApp: { getState(): { playerId: string } } } }
      ).__fx.useApp.getState().playerId,
  );
  let tick = 1;
  for (const [folderId, outcome] of [
    ['f91', 'correct'],
    ['f92', 'correct'],
    ['f93', 'wrong'],
  ] as const) {
    toPage({ type: 'event', tick: tick++, event: verdict(playerId, folderId, outcome) });
  }
  toPage({
    type: 'event',
    tick: tick++,
    event: {
      kind: 'stampApplied',
      stationId: 'st-archive',
      playerId,
      folderId: 'f91',
      stampId: 'l0-zalany-rynek-archive',
      via: 'minigame',
    },
  });
  toPage(LEVEL_END);
  await expect(page.getByTestId('results')).toBeVisible();

  // A second tab of the same browser opens on the main menu and reads the stored profile.
  const menu = await context.newPage();
  await menu.goto('/');
  dialog = await openProfile(menu, touch);
  await expectFits(menu, dialog);
  await expect(stat(dialog, 'levels')).toHaveText('1');
  await expect(stat(dialog, 'wins')).toHaveText('1');
  await expect(stat(dialog, 'accuracy')).toHaveText(/^67\s%$/);
  await expect(stat(dialog, 'favouriteRole')).toHaveText('Archiwista');
  await expect(stat(dialog, 'stamps')).toHaveText('1');
  await expect(stat(dialog, 'minigameFails')).toHaveText('0');
  await expect(
    dialog.getByTestId('profile-stars').locator('[data-difficulty="normal"]'),
  ).toContainText(/^Normalny\s*1 z\s\d+$/);
  await menu.screenshot({ path: testInfo.outputPath('profile.png'), scale: 'css' });

  // „Wyczyść statystyki” asks first; „Anuluj” keeps everything.
  await press(dialog.getByTestId('profile-clear'), touch);
  await press(dialog.getByTestId('profile-clear-cancel'), touch);
  await expect(stat(dialog, 'levels')).toHaveText('1');
  await press(dialog.getByTestId('profile-clear'), touch);
  await press(dialog.getByTestId('profile-clear-confirm'), touch);
  await expect(stat(dialog, 'levels')).toHaveText('0');
  await expect(stat(dialog, 'favouriteRole')).toHaveText('–');
  await expect(dialog.getByRole('status')).toHaveText('Statystyki wyczyszczone.');
});

test('the look is chosen by touch or keyboard and persists', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext(touch ? SMALL_PHONE : DESKTOP);
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const dialog = await openProfile(page, touch);
  await expectFits(page, dialog);
  const preview = dialog.getByTestId('profile-preview');
  await expect(preview).toContainText('Zośka');
  await expect(preview).toHaveAttribute('data-accessory', 'none');

  if (touch) {
    await dialog.getByTestId('profile-color-2').tap();
    await dialog.getByTestId('profile-accessory-scarf').tap();
  } else {
    // „Gotowe” has the focus; Tab reaches the colour group, the arrows pick within it.
    await expect(dialog.getByTestId('profile-close')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('radio', { name: 'Pomarańczowy, koło' })).toBeFocused();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'Morski, trójkąt' })).toBeChecked();
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByRole('radio', { name: 'Szalik' })).toBeChecked();
  }
  await expect(preview).toHaveAttribute('data-color', '2');
  await expect(preview).toHaveAttribute('data-accessory', 'scarf');
  await page.screenshot({ path: testInfo.outputPath('profile-look.png'), scale: 'css' });

  // Esc (keyboard) or „Gotowe” (touch) closes it; the choice survives a reload.
  if (touch) {
    await dialog.getByTestId('profile-close').tap();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const again = await openProfile(page, touch);
  await expect(again.getByTestId('profile-preview')).toHaveAttribute('data-color', '2');
  await expect(again.getByRole('radio', { name: 'Szalik' })).toBeChecked();
});

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

const PAD_A = 0;
const PAD_B = 1;
const PAD_DOWN = 13;

test('the gamepad reaches the reset, cancels it and closes the dialog', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad on the desktop project');
  const context = await browser.newContext(DESKTOP);
  trackContext(context);
  await context.addInitScript(installFakePad);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  const tap = async (button: number) => {
    const set = (down: boolean) =>
      page.evaluate(
        ([b, d]) =>
          (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad.press(
            b,
            d,
          ),
        [button, down] as const,
      );
    await set(true);
    await page.waitForTimeout(120);
    await set(false);
    await page.waitForTimeout(120);
  };
  const focused = () =>
    page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);

  const dialog = await openProfile(page, false);
  await expect(dialog.getByTestId('profile-close')).toBeFocused();
  // The d-pad walks down to „Wyczyść statystyki”.
  for (let step = 0; step < 6 && (await focused()) !== 'profile-clear'; step++) {
    await tap(PAD_DOWN);
  }
  expect(await focused()).toBe('profile-clear');
  await tap(PAD_A);
  await expect(dialog.getByTestId('profile-clear-cancel')).toBeFocused();
  // B answers „Anuluj” first, then closes the dialog.
  await tap(PAD_B);
  await expect(dialog.getByTestId('profile-clear')).toBeFocused();
  await expect(dialog).toBeVisible();
  await tap(PAD_B);
  await expect(dialog).not.toBeVisible();
});
