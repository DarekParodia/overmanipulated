import {
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  devices,
  expect,
  type Page,
} from '@playwright/test';

export const DESKTOP: BrowserContextOptions = { viewport: { width: 1366, height: 768 } };
export const PHONE: BrowserContextOptions = { ...devices['Pixel 7 landscape'] };

export type Player = { page: Page; nickname: string; touch: boolean };

const openContexts: BrowserContext[] = [];

/** Closes every context opened by `openPlayer`; idle scenes would otherwise keep rendering. */
export async function closePlayers(): Promise<void> {
  await Promise.all(openContexts.splice(0).map((context) => context.close()));
}

/** Registers a context opened by a spec itself, so `closePlayers` disposes of it too. */
export function trackContext(context: BrowserContext): void {
  openContexts.push(context);
}

export async function openPlayer(
  browser: Browser,
  nickname: string,
  options: BrowserContextOptions,
): Promise<Player> {
  const context = await browser.newContext(options);
  openContexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch: options.hasTouch === true };
}

export async function createRoom(host: Player): Promise<string> {
  await host.page.getByRole('button', { name: 'Otwórz pokój' }).click();
  const code = host.page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z]{4}$/);
  return (await code.textContent()) ?? '';
}

/** Joins by code and, unless told otherwise, signs the roster as ready so the host can start. */
export async function joinRoom(
  player: Player,
  code: string,
  { ready = true }: { ready?: boolean } = {},
): Promise<void> {
  await player.page.getByLabel('Kod pokoju').fill(code);
  await player.page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(player.page.getByTestId('room-code')).toHaveText(code);
  if (ready) {
    await setReady(player, true);
  }
}

/** Ticks (or clears) the guest's "Gotowy" box and waits for the server to confirm it. */
export async function setReady(player: Player, ready: boolean): Promise<void> {
  const box = player.page.getByRole('checkbox', { name: 'Gotowy' });
  // Controlled by the server's room state: a press sends the change, the tick follows the echo.
  if ((await box.isChecked()) !== ready) {
    await player.page.locator('label').filter({ has: box }).click();
  }
  if (ready) {
    await expect(box).toBeChecked();
  } else {
    await expect(box).not.toBeChecked();
  }
}

/** Picks a press pass (role) and waits for the server to confirm it. */
export async function pickRole(player: Player, roleName: string): Promise<void> {
  const pass = player.page.getByRole('radio', { name: roleName });
  // The native radio is a 1 px input under the pass; press the pass itself, as a player does.
  await player.page.locator('label').filter({ has: pass }).click();
  await expect(pass).toBeChecked();
}

/** The duty-roster strip of the player with this nickname, as `viewer` sees it. */
export function rosterRow(viewer: Player, nickname: string) {
  return viewer.page.getByRole('listitem').filter({ hasText: nickname });
}

/** Positions of all avatars as this player's client renders them, keyed by nickname. */
export async function avatarPositions(
  player: Player,
): Promise<Record<string, { x: number; z: number }>> {
  return player.page.evaluate(() => {
    const scene = (
      window as unknown as {
        __scene?: {
          traverse(
            fn: (o: { name: string; visible: boolean; position: { x: number; z: number } }) => void,
          ): void;
        };
      }
    ).__scene;
    const out: Record<string, { x: number; z: number }> = {};
    scene?.traverse((object) => {
      if (object.name.startsWith('player:') && object.visible) {
        out[object.name.slice('player:'.length)] = { x: object.position.x, z: object.position.z };
      }
    });
    return out;
  });
}

/** Moves right for `ms` with the keyboard, or by dragging the touch joystick on touch devices. */
export async function moveRight(player: Player, ms: number): Promise<void> {
  const { page } = player;
  if (!player.touch) {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyD');
    return;
  }
  const zone = await page.getByTestId('touch-joystick').boundingBox();
  if (!zone) {
    throw new Error('joystick zone not visible');
  }
  const x = zone.x + zone.width / 2;
  const y = zone.y + zone.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x + i * 10, y, id: 1 }],
    });
  }
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
