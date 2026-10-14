// S7-47: roles and abilities end to end. On desktop the managing editor presses R and the server
// extends a folder (the chip cools down, the card shows the added time, the caption names it).
// On a phone (Pixel 7 landscape and the 640×360 phone-small project) a Ratownik gets the fourth
// thumb button labelled „Podaj”, blocked while he carries nothing.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type TestInfo,
  test,
} from '@playwright/test';
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

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };

/** The context options of the running project (the specs open their own contexts). */
function deviceOf(testInfo: TestInfo): BrowserContextOptions {
  switch (testInfo.project.name) {
    case 'mobile':
      return PHONE;
    case 'phone-small':
      return SMALL_PHONE;
    default:
      return DESKTOP;
  }
}

/**
 * A solo host with captions on and the first-game tutorial done (its last card is the ability
 * step, which a solo Ratownik skips anyway), on Training (l0).
 */
async function soloHost(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => {
    localStorage.setItem('redakcja.tutorial.done', '1');
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ captions: true }));
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

/** Picks the role, starts the level and skips the briefing. */
async function startWithRole(player: Player, role: string): Promise<void> {
  const { page } = player;
  await createRoom(player);
  await expect(page.getByTestId('level-card')).toContainText('Makieta');
  await pickRole(player, role);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  const ready = page.getByRole('button', { name: 'Gotowy!' });
  // The e2e server's briefing is short: it may end before the button can be pressed.
  await ready.click({ timeout: 3000 }).catch(() => undefined);
  await expect(page.getByTestId('hud')).toBeVisible();
}

test('desktop: Redaktor prowadzący presses R, the folder gets +20 s and the chip cools', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard ability chip');
  const player = await soloHost(browser, deviceOf(testInfo));
  const { page } = player;
  await startWithRole(player, 'Redaktor prowadzący');

  const chip = page.getByTestId('hud-ability');
  // The first folder spawns 3 s into the level; until then Przedłużenie has nothing to extend.
  await expect(page.locator('[data-folder]').first()).toBeVisible({ timeout: 15_000 });
  await expect(chip).toHaveAttribute('data-ability', 'extendDeadline');
  await expect(chip).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-extended]')).toHaveCount(0);

  await page.keyboard.press('r');
  // The caption lives 2.4 s, so it is checked first.
  await expect(page.getByTestId('caption').filter({ hasText: 'Więcej czasu' })).toBeVisible();
  await expect(chip).toHaveAttribute('data-state', 'cooling');
  await expect(page.locator('[data-extended]').first()).toBeVisible();
});

test('touch: a Ratownik gets the „Podaj” button, blocked with empty hands', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'touch ability button');
  const player = await soloHost(browser, deviceOf(testInfo));
  const { page } = player;
  await startWithRole(player, 'Ratownik');

  const button = page.getByTestId('touch-ability');
  await expect(button).toBeVisible();
  await expect(button).toHaveAttribute('data-ability', 'passFolder');
  await expect(button).toContainText('Podaj');
  await expect(button).toHaveAttribute('data-state', 'blocked');
  // The keyboard chip is not shown on touch.
  await expect(page.getByTestId('hud-ability')).toHaveCount(0);
  const viewport = page.viewportSize();
  const box = await button.boundingBox();
  expect(box).not.toBeNull();
  if (box && viewport) {
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }
});
