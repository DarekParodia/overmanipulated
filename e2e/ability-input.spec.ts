// S7-39: the role ability press. R (and RB on a pad) in a running level sends one target-free
// `useAbility` command; without a role (or, since S7-40, whenever the shared preview says the
// press does nothing) the press stays on the client. The server has no test
// hook for commands, so the spec reads the client's own WebSocket frames.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, pickRole, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

type Hook = { getState(): { elapsedMs: number } };

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

/** Opens a solo level, optionally with a role, and collects every `useAbility` frame sent. */
async function openSolo(
  browser: Browser,
  options: BrowserContextOptions,
  role: string | null,
  { pad = false } = {},
): Promise<{ page: Page; presses: () => number }> {
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
  let count = 0;
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => {
      if (typeof payload === 'string' && payload.includes('"useAbility"')) {
        count++;
      }
    });
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const player = { page, nickname: 'Zośka', touch: options.hasTouch === true };
  await createRoom(player);
  if (role) {
    await pickRole(player, role);
  }
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { __game: Hook }).__game.getState().elapsedMs),
    )
    .toBeGreaterThan(0);
  return { page, presses: () => count };
}

test('R sends useAbility for a player with a role', async ({ browser }, testInfo) => {
  const options = testInfo.project.name === 'desktop' ? DESKTOP : PHONE;
  // Ekspertyza on l0 (which has an Archiwum) arms, then disarms: both presses reach the server.
  const { page, presses } = await openSolo(browser, options, 'Archiwista');
  await page.keyboard.press('KeyR');
  await expect.poll(presses).toBe(1);
  // One press is one command, however long the key is held.
  await page.keyboard.down('KeyR');
  await page.waitForTimeout(300);
  await page.keyboard.up('KeyR');
  await expect.poll(presses).toBe(2);
});

test('RB on a gamepad sends useAbility', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad on the desktop project');
  const { page, presses } = await openSolo(browser, DESKTOP, 'Archiwista', { pad: true });
  const press = (down: boolean) =>
    page.evaluate(
      (d) =>
        (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad.press(
          5,
          d,
        ),
      down,
    );
  await press(true);
  await page.waitForTimeout(200);
  await press(false);
  await expect.poll(presses).toBe(1);
});

test('without a role the press stays on the client', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const { page, presses } = await openSolo(browser, DESKTOP, null);
  await page.keyboard.press('KeyR');
  await page.waitForTimeout(500);
  expect(presses()).toBe(0);
});
