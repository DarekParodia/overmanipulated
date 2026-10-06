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

export async function joinRoom(player: Player, code: string): Promise<void> {
  await player.page.getByLabel('Kod pokoju').fill(code);
  await player.page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(player.page.getByTestId('room-code')).toHaveText(code);
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
