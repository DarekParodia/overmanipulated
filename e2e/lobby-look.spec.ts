// S7-105: the profile's look over the wire. The host brings a preferred colour and a bow tie from
// the profile; a guest who prefers the same colour gets the lowest free one. In the lobby the guest
// opens „Zmień wygląd” on their own card: the host's colour is crossed out, and the scarf and a
// free colour reach the host's lobby at once. Both accessories are on the 3D characters once the
// level starts. Touch at 640×360 (phone-small) and on a phone, mouse on desktop; keyboard and
// gamepad on desktop.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  PHONE,
  type Player,
  setReady,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };

function optionsFor(project: string): BrowserContextOptions {
  if (project === 'desktop') {
    return DESKTOP;
  }
  return project === 'phone-small' ? SMALL_PHONE : PHONE;
}

/** A player whose browser already has a profile look (`redakcja.profile.v1`). */
async function openWithLook(
  browser: Browser,
  nickname: string,
  options: BrowserContextOptions,
  look: { color: number | null; accessory: string },
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((value) => {
    window.localStorage.setItem('redakcja.profile.v1', value);
  }, JSON.stringify(look));
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch: options.hasTouch === true };
}

async function press(player: Player, target: Locator): Promise<void> {
  await (player.touch ? target.tap() : target.click());
}

function card(viewer: Player, nickname: string): Locator {
  return viewer.page.locator(`[data-testid="player-card"][data-player="${nickname}"]`);
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

/** The accessory each 3D character wears, by nickname (the `?debug` scene hook). */
function sceneAccessories(player: Player): Promise<Record<string, string>> {
  return player.page.evaluate(() => {
    type Node = {
      name: string;
      userData: { accessory?: string };
      traverse(fn: (o: Node) => void): void;
    };
    const scene = (window as unknown as { __scene?: Node }).__scene;
    const out: Record<string, string> = {};
    scene?.traverse((object) => {
      if (!object.name.startsWith('player:')) {
        return;
      }
      object.traverse((child) => {
        if (child.name === 'avatar-body' && child.userData.accessory) {
          out[object.name.slice('player:'.length)] = child.userData.accessory;
        }
      });
    });
    return out;
  });
}

test('the look reaches the lobby and the 3D characters', async ({ browser }, testInfo) => {
  const options = optionsFor(testInfo.project.name);
  const host = await openWithLook(browser, 'Zośka', DESKTOP, { color: 1, accessory: 'bowTie' });
  const guest = await openWithLook(browser, 'Bartek', options, { color: 1, accessory: 'none' });
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });

  // The host got the preferred colour; the guest's taken preference fell back to the lowest free.
  await expect(card(guest, 'Zośka')).toHaveAttribute('data-color', '1');
  await expect(card(guest, 'Zośka').getByTestId('player-accessory')).toHaveAttribute(
    'data-accessory',
    'bowTie',
  );
  await expect(card(host, 'Bartek')).toHaveAttribute('data-color', '0');
  await expect(card(host, 'Bartek').getByTestId('player-accessory')).toHaveCount(0);

  // Only the own card has „Zmień wygląd”; it opens the profile with the host's colour taken.
  await expect(card(guest, 'Zośka').getByTestId('change-look')).toHaveCount(0);
  const change = card(guest, 'Bartek').getByTestId('change-look');
  // A full touch target, measured once the card's pop-in has settled.
  await expect
    .poll(async () => (await change.boundingBox())?.width ?? 0)
    .toBeGreaterThanOrEqual(48);
  await press(guest, change);
  const dialog = guest.page.getByTestId('profile');
  await expect(dialog.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await expectFits(guest.page, dialog);
  await expect(dialog.getByTestId('profile-color-1')).toHaveAttribute('data-taken', 'true');
  await expect(dialog.getByRole('radio', { name: /Niebieski, kwadrat – zajęty/ })).toBeDisabled();
  await expect(dialog.getByTestId('profile-taken-note')).toHaveText('Zajęty w pokoju');
  await expect(dialog.getByTestId('profile-preview')).toHaveAttribute('data-color', '0');
  // The tick is on the colour the room gave, never on the crossed-out preference.
  await expect(dialog.getByRole('radio', { name: 'Pomarańczowy, koło' })).toBeChecked();

  await press(guest, dialog.getByTestId('profile-color-3'));
  await press(guest, dialog.getByTestId('profile-accessory-scarf'));
  await expect(card(host, 'Bartek')).toHaveAttribute('data-color', '3');
  await expect(card(host, 'Bartek').getByTestId('player-accessory')).toHaveAttribute(
    'data-accessory',
    'scarf',
  );
  await expect(dialog.getByTestId('profile-preview')).toHaveAttribute('data-color', '3');
  await expect(dialog.getByRole('radio', { name: 'Różowy, romb' })).toBeChecked();
  await testInfo.attach('look-in-room', {
    body: await guest.page.screenshot(),
    contentType: 'image/png',
  });
  await press(guest, dialog.getByTestId('profile-close'));
  await expect(dialog).toBeHidden();
  await expect(card(guest, 'Bartek').getByTestId('player-accessory')).toHaveAttribute(
    'data-accessory',
    'scarf',
  );

  // Both looks are on the 3D characters.
  await setReady(guest, true);
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(host.page.getByTestId('hud')).toBeVisible();
  await expect.poll(() => sceneAccessories(host)).toEqual({ Zośka: 'bowTie', Bartek: 'scarf' });
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

/** Presses and releases one pad button (standard mapping: 0 A, 1 B). */
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

test('„Zmień wygląd” by keyboard and by gamepad at 640×360', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard and gamepad');
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  trackContext(context);
  await context.addInitScript(installFakePad);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const host: Player = { page, nickname: 'Zośka', touch: false };
  await createRoom(host);
  const change = card(host, 'Zośka').getByTestId('change-look');
  const dialog = page.getByTestId('profile');

  // Keyboard: Enter opens, an arrow key picks the next accessory, Esc closes.
  await change.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await expectFits(page, dialog);
  await dialog.getByTestId('profile-accessory-none').locator('input').focus();
  await page.keyboard.press('ArrowRight');
  await expect(card(host, 'Zośka').getByTestId('player-accessory')).toHaveAttribute(
    'data-accessory',
    'scarf',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  // Gamepad: A on the focused button opens the profile, B closes it.
  await change.focus();
  await tapPad(page, 0);
  await expect(dialog.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await tapPad(page, 1);
  await expect(dialog).toBeHidden();
});
