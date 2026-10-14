// S7-42: the armed ability badge in the world, beside the player, at 1366x768 with the
// keyboard and at a 640x360 phone with the fourth touch button. A second press disarms and the
// badge goes; the badge never covers the HUD or the name tag and stays on screen.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
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

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';
const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };
const ARMED = '[data-testid="ability-marker"][data-kind="armed"]';

type Box = { top: number; bottom: number; left: number; right: number };

async function startSolo(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => {
    localStorage.setItem('redakcja.tutorial.done', '1');
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ reducedMotion: true }));
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const player = { page, nickname: 'Zośka', touch: options.hasTouch === true };
  await createRoom(player);
  await pickRole(player, 'Archiwista');
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  return player;
}

async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }),
  );
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** The badge is on screen and clear of the HUD pill, the menu button and the name tag. */
async function expectBadgeClear(page: Page, width: number, height: number): Promise<void> {
  const [badge] = await boxes(page, ARMED);
  if (!badge) {
    throw new Error('no armed badge');
  }
  expect(badge.left >= 0 && badge.top >= 0 && badge.right <= width && badge.bottom <= height).toBe(
    true,
  );
  const others = [
    '[data-testid="hud"]',
    '[data-testid="game-menu-button"]',
    '[data-testid="name-tag"]',
  ];
  for (const hud of others) {
    for (const other of await boxes(page, hud)) {
      expect(
        overlaps(badge, other),
        `badge ${JSON.stringify(badge)} overlaps ${hud} ${JSON.stringify(other)}`,
      ).toBe(false);
    }
  }
}

test('desktop: R arms Ekspertyza and a blue badge floats beside the player', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const { page } = await startSolo(browser, DESKTOP);
  const chip = page.getByTestId('hud-ability');
  await expect(chip).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('[data-testid="ability-marker"]')).toHaveCount(0);

  await page.keyboard.press('KeyR');
  await expect(chip).toHaveAttribute('data-state', 'armed');
  const badge = page.locator(ARMED);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label', 'Zośka: Ekspertyza uzbrojona');
  await expectBadgeClear(page, 1366, 768);
  await page.screenshot({
    path: testInfo.outputPath('desktop-armed.png'),
    scale: 'css',
    style: HIDE_PERF,
  });

  await page.keyboard.press('KeyR');
  await expect(chip).toHaveAttribute('data-state', 'ready');
  await expect(badge).toHaveCount(0);
});

test('640x360 touch: the fourth button arms and disarms the badge', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch layout');
  const { page } = await startSolo(browser, SMALL_PHONE);
  const button = page.getByTestId('touch-ability');
  await expect(button).toHaveAttribute('data-state', 'ready');

  await button.tap();
  await expect(button).toHaveAttribute('data-state', 'armed');
  await expect(page.locator(ARMED)).toBeVisible();
  await expectBadgeClear(page, 640, 360);
  await page.screenshot({
    path: testInfo.outputPath('phone-armed.png'),
    scale: 'css',
    style: HIDE_PERF,
  });

  await button.tap();
  await expect(button).toHaveAttribute('data-state', 'ready');
  await expect(page.locator(ARMED)).toHaveCount(0);
});
