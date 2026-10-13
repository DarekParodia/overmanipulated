import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, type Player, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';
/** The smallest supported phone (S7-12 moves these checks to its phone-small project). */
const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };

type Box = { top: number; bottom: number; left: number; right: number };

/**
 * Opens a player with captions on (so the caption stack is in the page) and reduced motion (no
 * pop-in scale, so measured boxes are the laid-out ones), plus the given settings and progress.
 */
async function open(
  browser: Browser,
  options: BrowserContextOptions,
  settings: Record<string, unknown> = {},
  progress: Record<string, number> = {},
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(
    ({ settings, progress }) => {
      localStorage.setItem('redakcja.tutorial.done', '1');
      localStorage.setItem(
        'redakcja.settings.v1',
        JSON.stringify({ captions: true, reducedMotion: true, ...settings }),
      );
      localStorage.setItem('redakcja.progress.v1', JSON.stringify(progress));
    },
    { settings, progress },
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

async function startSolo(player: Player, levelTile?: string): Promise<void> {
  await createRoom(player);
  if (levelTile) {
    await player.page.getByTestId(levelTile).click();
  }
  await player.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(player.page.getByTestId('hud')).toBeVisible();
}

async function box(page: Page, selector: string): Promise<Box> {
  return page
    .locator(selector)
    .first()
    .evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
}

/** The measured band GameScreen publishes as `--hud-band` (0 before the first measurement). */
async function band(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    return main ? Number.parseFloat(main.style.getPropertyValue('--hud-band')) || 0 : 0;
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const PILL = '[data-testid="hud"]';
const QUEUE = '[data-testid="hud-queue"]';
const MENU = '[data-testid="game-menu-button"]';
const CAPTIONS = 'section[aria-label="Napisy dźwięków"]';

/** Pill, queue and menu button sit inside the band; captions start under it. */
async function expectBand(page: Page): Promise<number> {
  await expect.poll(() => band(page)).toBeGreaterThan(0);
  const px = await band(page);
  const pill = await box(page, PILL);
  const queue = await box(page, QUEUE);
  const menu = await box(page, MENU);
  expect(pill.bottom).toBeLessThanOrEqual(px);
  expect(queue.bottom).toBeLessThanOrEqual(px);
  expect(menu.bottom).toBeLessThanOrEqual(px);
  expect(overlaps(queue, pill)).toBe(false);
  expect(overlaps(queue, menu)).toBe(false);
  const captions = await box(page, CAPTIONS);
  expect(captions.top).toBeGreaterThanOrEqual(px);
  return px;
}

/** Points, credibility and the clock stay 30 px numbers (design-rules §1.7). */
async function expectNumbers30(page: Page): Promise<void> {
  const sizes = await page.evaluate(() =>
    [
      '[data-testid="hud-timer"] [role="timer"]',
      '[data-testid="hud-score"] > span',
      '[data-testid="hud-credibility"] > span',
    ].map((selector) => {
      const node = document.querySelector(selector);
      return node ? getComputedStyle(node).fontSize : 'missing';
    }),
  );
  expect(sizes).toEqual(['30px', '30px', '30px']);
}

// S7-11: on a 640×360 phone the pill is one low row, the HUD band stays a thin strip, the numbers
// keep their size, and captions start under the band.
test('a 640×360 phone shows a one-row pill under a thin HUD band', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  const player = await open(browser, SMALL_PHONE);
  const { page } = player;
  await startSolo(player);

  const pill = await box(page, PILL);
  expect(pill.bottom - pill.top).toBeLessThanOrEqual(60);
  // One row: the clock, points and credibility share a line.
  const timer = await box(page, '[data-testid="hud-timer"]');
  const score = await box(page, '[data-testid="hud-score"]');
  const gauge = await box(page, '[data-testid="hud-credibility"]');
  expect(score.left).toBeGreaterThanOrEqual(timer.right);
  expect(gauge.left).toBeGreaterThanOrEqual(score.right);
  expect(gauge.right).toBeLessThanOrEqual(pill.right);
  await expectNumbers30(page);
  const px = await expectBand(page);
  expect(px).toBeLessThanOrEqual(72);
  await page.screenshot({ path: testInfo.outputPath('phone.png'), scale: 'css', style: HIDE_PERF });

  // A long number widens the pill instead of clipping it, and the queue moves along.
  await page
    .locator('[data-testid="hud-score"] > span')
    .first()
    .evaluate((node) => {
      node.textContent = '\u22121\u202f250';
    });
  await expect
    .poll(async () => (await box(page, QUEUE)).left - (await box(page, PILL)).right)
    .toBeGreaterThanOrEqual(8);
  const wide = await box(page, PILL);
  expect(wide.right - wide.left).toBeGreaterThan(pill.right - pill.left);
  expect((await box(page, '[data-testid="hud-credibility"]')).right).toBeLessThanOrEqual(
    wide.right,
  );
  await expectBand(page);
});

// Left-handed play mirrors the touch controls; the captions move to the right edge as before and
// still start under the band, and the HUD keeps clear of the bottom corners.
test('left-handed: captions stay right and under the band on a 640×360 phone', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  const player = await open(browser, SMALL_PHONE, { leftHanded: true });
  const { page } = player;
  await startSolo(player);

  const px = await expectBand(page);
  const captions = await box(page, CAPTIONS);
  // The fixed 10 rem offset under the event banners, as before S7-11.
  expect(captions.top).toBeGreaterThanOrEqual(168);
  expect(captions.right).toBeGreaterThan(640 - 24);
  expect(px).toBeLessThanOrEqual(72);
  await page.screenshot({
    path: testInfo.outputPath('left-handed.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// Endless puts „Tempo ×N” inside the phone pill's row (a wider pill), not under it.
test('endless: the tempo chip sits inside the one-row phone pill', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'phone layout');
  const progress = { 'l1-burza': 3, 'l2-wybory': 3, 'l3-afera': 3, 'l4-zdrowie': 3 };
  const player = await open(browser, SMALL_PHONE, {}, progress);
  const { page } = player;
  await startSolo(player, 'level-tile-endless');

  await expect(page.getByTestId('hud-tempo')).toBeVisible();
  const pill = await box(page, PILL);
  const tempo = await box(page, '[data-testid="hud-tempo"]');
  expect(pill.bottom - pill.top).toBeLessThanOrEqual(60);
  expect(tempo.bottom).toBeLessThanOrEqual(pill.bottom);
  expect(tempo.right).toBeLessThanOrEqual(pill.right);
  const gauge = await box(page, '[data-testid="hud-credibility"]');
  expect(gauge.right).toBeLessThanOrEqual(pill.right);
  // The reserved 22.5 rem holds the opening numbers without widening.
  expect(pill.right - pill.left).toBeLessThanOrEqual(360);
  // The rendered text (the words „Tempo ×1” are hidden on phones).
  expect(await page.getByTestId('hud-tempo').innerText()).toBe('×1');
  await expectNumbers30(page);
  expect(await expectBand(page)).toBeLessThanOrEqual(72);
  await page.screenshot({
    path: testInfo.outputPath('endless.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// Desktop keeps its two-part pill; the band follows the taller folder queue.
test('desktop: captions start under the measured HUD band', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'desktop layout');
  const player = await open(browser, DESKTOP);
  const { page } = player;
  await startSolo(player);

  const px = await expectBand(page);
  expect(px).toBeLessThanOrEqual(768 * 0.3);
  await page.screenshot({
    path: testInfo.outputPath('desktop.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});
