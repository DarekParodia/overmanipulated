import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, type Player, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

type Box = { top: number; bottom: number; left: number; right: number };

/**
 * Opens a player with captions on (so the caption stack is in the page) and reduced motion (no
 * pop-in scale, so measured boxes are the laid-out ones). The phone checks live in
 * phone-layout.spec.ts (S7-12).
 */
async function open(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => {
    localStorage.setItem('redakcja.tutorial.done', '1');
    localStorage.setItem(
      'redakcja.settings.v1',
      JSON.stringify({ captions: true, reducedMotion: true }),
    );
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

async function startSolo(player: Player): Promise<void> {
  await createRoom(player);
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

/**
 * The band is measured from layout offsets (`hud/hud-band.ts`, so CSS transforms never move it),
 * which are whole pixels, while bounding boxes keep fractions (a pill 107.19 px tall measures as
 * 107): an edge may pass the band by less than a pixel.
 */
const SUBPIXEL = 1;

/**
 * Pill, queue and menu button sit inside the band; captions start under it. The band is published
 * a frame after a HUD change (a folder card arriving grows the queue), so the band and the boxes
 * are read together and retried until they agree: a band that never catches up still fails.
 */
async function expectBand(page: Page): Promise<number> {
  let px = 0;
  await expect(async () => {
    px = await band(page);
    expect(px).toBeGreaterThan(0);
    const pill = await box(page, PILL);
    const queue = await box(page, QUEUE);
    const menu = await box(page, MENU);
    expect(pill.bottom).toBeLessThanOrEqual(px + SUBPIXEL);
    expect(queue.bottom).toBeLessThanOrEqual(px + SUBPIXEL);
    expect(menu.bottom).toBeLessThanOrEqual(px + SUBPIXEL);
    expect(overlaps(queue, pill)).toBe(false);
    expect(overlaps(queue, menu)).toBe(false);
    const captions = await box(page, CAPTIONS);
    expect(captions.top).toBeGreaterThanOrEqual(px);
  }).toPass({ timeout: 10_000 });
  return px;
}

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
