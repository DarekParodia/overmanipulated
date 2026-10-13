// S7-40: the role ability chip (keyboard and gamepad, bottom-left), the fourth touch button and
// the folder-card marks. Screenshots at 1366x768 and at a 640x360 phone (touch and mirrored),
// with checks that the chip and the button overlap nothing.
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

type Box = { top: number; bottom: number; left: number; right: number };

/** Captions on (the caption must show) and reduced motion (boxes are the laid-out ones). */
async function open(
  browser: Browser,
  options: BrowserContextOptions,
  settings: Record<string, unknown> = {},
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((settings) => {
    localStorage.setItem('redakcja.tutorial.done', '1');
    localStorage.setItem(
      'redakcja.settings.v1',
      JSON.stringify({ captions: true, reducedMotion: true, ...settings }),
    );
  }, settings);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

async function startSolo(player: Player, role: string): Promise<void> {
  await createRoom(player);
  await pickRole(player, role);
  await player.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(player.page.getByTestId('hud')).toBeVisible();
}

async function boxes(page: Page, selector: string): Promise<Box[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }),
  );
}

async function box(page: Page, selector: string): Promise<Box> {
  const [first] = await boxes(page, selector);
  if (!first) {
    throw new Error(`${selector} is not on the page`);
  }
  return first;
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

function inside(a: Box, width: number, height: number): boolean {
  return a.left >= 0 && a.top >= 0 && a.right <= width && a.bottom <= height;
}

const HUD_PARTS = [
  '[data-testid="hud"]',
  '[data-testid="hud-queue"]',
  '[data-testid="game-menu-button"]',
];

/** The element overlaps none of the HUD parts nor any other visible box of the selectors. */
async function expectClear(page: Page, selector: string, others: readonly string[]) {
  const target = await box(page, selector);
  for (const other of [...HUD_PARTS, ...others]) {
    for (const b of await boxes(page, other)) {
      expect(overlaps(target, b), `${selector} overlaps ${other}`).toBe(false);
    }
  }
}

test('desktop: the chip shows Przedłużenie, R extends the outlined folder', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard chip');
  // A full solo start, two presses, two waits on the cooldown state and two screenshots.
  test.slow();
  const player = await open(browser, DESKTOP);
  const { page } = player;
  await startSolo(player, 'Redaktor prowadzący');

  const chip = page.getByTestId('hud-ability');
  await expect(page.locator('[data-folder]').first()).toBeVisible();
  await expect(chip).toHaveAttribute('data-state', 'ready');
  await expect(chip).toHaveAttribute('data-ability', 'extendDeadline');
  await expect(chip).toContainText('R');
  await expect(page.getByTestId('touch-ability')).toHaveCount(0);
  // The most urgent folder (nobody carries one yet) is the target.
  await expect(page.locator('[data-ability-target]')).toHaveCount(1);

  const chipBox = await box(page, '[data-testid="hud-ability"]');
  expect(inside(chipBox, 1366, 768)).toBe(true);
  expect(chipBox.left).toBeLessThan(1366 / 4);
  expect(chipBox.bottom).toBeGreaterThan(768 * 0.8);
  await expectClear(page, '[data-testid="hud-ability"]', [
    'section[aria-label="Napisy dźwięków"] li',
    '[data-testid="guidance-hint"]',
  ]);
  await page.screenshot({
    path: testInfo.outputPath('desktop-ready.png'),
    scale: 'css',
    style: HIDE_PERF,
  });

  await page.keyboard.press('KeyR');
  // The caption lives 2.4 s, so it is checked first.
  await expect(page.getByTestId('caption').filter({ hasText: 'Więcej czasu' })).toBeVisible();
  await expect(chip).toHaveAttribute('data-state', 'cooling');
  await expect(page.locator('[data-extended]').first()).toBeVisible();
  await expect(page.getByTestId('folder-extended').first()).toHaveText('+20');
  await expect(page.locator('[data-ability-target]')).toHaveCount(0);
  // A second press while cooling stays on the client and changes nothing.
  await page.keyboard.press('KeyR');
  await expect(chip).toHaveAttribute('data-state', 'cooling');
  await expect(chip).toContainText('Odnowienie');
  await expectClear(page, '[data-testid="hud-ability"]', [
    'section[aria-label="Napisy dźwięków"] li',
  ]);
  await page.screenshot({
    path: testInfo.outputPath('desktop-cooling.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

for (const leftHanded of [false, true]) {
  test(`640x360 touch${leftHanded ? ', mirrored' : ''}: the fourth button arms Ekspertyza`, async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'touch layout');
    const player = await open(browser, SMALL_PHONE, { leftHanded });
    const { page } = player;
    await startSolo(player, 'Archiwista');

    const button = page.getByTestId('touch-ability');
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('data-state', 'ready');
    await expect(button).toContainText('Ekspert');
    await expect(page.getByTestId('hud-ability')).toHaveCount(0);

    const own = await box(page, '[data-testid="touch-ability"]');
    expect(inside(own, 640, 360)).toBe(true);
    // Same side as the other thumb buttons; the left half is the joystick's (mirrored: swapped).
    if (leftHanded) {
      expect(own.right).toBeLessThan(320);
    } else {
      expect(own.left).toBeGreaterThan(320);
    }
    const others = (await boxes(page, '[data-testid="touch-controls"] button')).filter(
      (b) => b.left !== own.left || b.top !== own.top,
    );
    expect(others).toHaveLength(3);
    for (const other of others) {
      expect(overlaps(own, other)).toBe(false);
    }
    await expectClear(page, '[data-testid="touch-ability"]', [
      'section[aria-label="Napisy dźwięków"] li',
    ]);
    await page.screenshot({
      path: testInfo.outputPath(leftHanded ? 'phone-mirrored.png' : 'phone.png'),
      scale: 'css',
      style: HIDE_PERF,
    });

    await button.tap();
    await expect(button).toHaveAttribute('data-state', 'armed');
    // At 640x360 only the newest caption chip shows, so a folder caption arriving at the same
    // time may hide this one: it must be in the stack, not necessarily on top.
    await expect(
      page.locator('section[aria-label="Napisy dźwięków"]').getByText('Zdolność uzbrojona'),
    ).toBeAttached();
  });
}

test('touch without a role: the fourth cell stays empty', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch layout');
  const player = await open(browser, SMALL_PHONE);
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('touch-ping')).toBeVisible();
  await expect(page.getByTestId('touch-ability')).toHaveCount(0);
});
