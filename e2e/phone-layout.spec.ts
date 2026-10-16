// S7-11/S7-12: the phone layout. Runs in the `mobile` project (Pixel 7 landscape, 863×360) and
// in `phone-small` (the same phone at 640×360, the smallest supported screen): a one-row pill
// under a thin HUD band, the folder queue between the pill and the menu button, captions under
// the band, the follow camera framing the room under it, the menu sheet and the results page.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  type TestInfo,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, PHONE, type Player, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

type Box = { top: number; bottom: number; left: number; right: number };

type Hook = {
  getState(): { elapsedMs: number };
  setState(state: Record<string, unknown>): void;
  map(): { fixtures: { id: string; kind: string }[] };
  inject(state: Record<string, unknown>): void;
};

/** The phone this project runs: a Pixel 7 in landscape at the project's viewport. */
function phone(testInfo: TestInfo): BrowserContextOptions {
  const viewport = testInfo.project.use.viewport;
  return viewport ? { ...PHONE, viewport } : PHONE;
}

/** The smallest supported phone, where two folder cards fill the queue. */
function isSmall(testInfo: TestInfo): boolean {
  return (testInfo.project.use.viewport?.width ?? Number.POSITIVE_INFINITY) <= 640;
}

/**
 * Opens a player with captions on (so the caption stack is in the page), the tutorial done and
 * reduced motion (no pop-in scale, so measured boxes are the laid-out ones), plus the given
 * settings and progress.
 */
async function open(
  browser: Browser,
  testInfo: TestInfo,
  settings: Record<string, unknown> = {},
  progress: Record<string, number> = {},
): Promise<Player> {
  const options = phone(testInfo);
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
const BELT_SIGN = '[data-testid="station-sign"][data-kind="conveyor"]';

/**
 * Pill, queue and menu button sit inside a band of at most 72 px; captions start under it. The
 * band is published a frame after a HUD change, so the band and the boxes are read together and
 * retried until they agree (as in hud-band.spec.ts).
 */
async function expectBand(page: Page): Promise<number> {
  let px = 0;
  await expect(async () => {
    px = await band(page);
    expect(px).toBeGreaterThan(0);
    expect(px).toBeLessThanOrEqual(72);
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
  }).toPass({ timeout: 10_000 });
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

/**
 * Pins `count` folders on the conveyor and the next scheduled folder 20 s away over the
 * server's snapshots, through the ?debug game hook.
 */
async function pin(page: Page, count: number): Promise<void> {
  await page.evaluate((count) => {
    const game = (window as unknown as { __game: Hook }).__game;
    const at = game.getState().elapsedMs;
    const belt = game
      .map()
      .fixtures.filter((f) => f.kind === 'conveyor')
      .map((f) => f.id);
    game.inject({
      folders: Array.from({ length: count }, (_, i) => ({
        id: `f-next-${i}`,
        spawnKey: `s${i}`,
        storyId: 'l0-zalany-rynek',
        location: { kind: 'fixture', fixtureId: belt[i % belt.length] },
        stamps: [],
        spawnedAtMs: at,
        deadlineMs: at + 90_000 + i * 10_000,
        warned: false,
      })),
      nextFolder: { atMs: at + 20_000, sinceMs: at },
      conveyorFull: false,
    });
  }, count);
}

// The pill is one low row, the HUD band a thin strip, the numbers keep their size, the menu
// button stays a big target, and the follow camera frames the room under the band: the belt's
// „Wejście” sign stands below it, not behind the pill.
test('a solo level keeps the HUD in one thin band', async ({ browser }, testInfo) => {
  const player = await open(browser, testInfo);
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
  const menu = await box(page, MENU);
  expect(menu.right - menu.left).toBeGreaterThanOrEqual(48);
  expect(menu.bottom - menu.top).toBeGreaterThanOrEqual(48);
  // The sign stands on its foot (its bottom edge), which the camera keeps under the band.
  await expect.poll(async () => (await box(page, BELT_SIGN)).bottom).toBeGreaterThan(px);
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

// Esc opens the menu as a right sheet; every button is on screen and „Wróć do gry” is there.
test('Esc opens the menu sheet inside the screen', async ({ browser }, testInfo) => {
  const player = await open(browser, testInfo);
  const { page } = player;
  await startSolo(player);
  await expect.poll(() => band(page)).toBeGreaterThan(0);

  await page.keyboard.press('Escape');
  const menu = page.getByTestId('game-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Wróć do gry' })).toBeVisible();
  const viewport = page.viewportSize();
  if (!viewport) {
    throw new Error('no viewport');
  }
  const boxes = await menu.getByRole('button').evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(4);
  for (const b of boxes) {
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.top).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(viewport.width);
    expect(b.bottom).toBeLessThanOrEqual(viewport.height);
    expect(b.h).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('menu.png'), scale: 'css', style: HIDE_PERF });
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

// The level's end opens the results on their first page, with the star captions.
test('the results open on the summary page with the star captions', async ({
  browser,
}, testInfo) => {
  const player = await open(browser, testInfo);
  const { page } = player;
  await startSolo(player);
  await page.evaluate(() => {
    (window as unknown as { __game: Hook }).__game.setState({
      levelEnd: {
        type: 'levelEnd',
        levelId: 'l0-greybox',
        won: true,
        stars: 1,
        score: 15,
        credibility: 45,
        results: [],
        lossReason: null,
        starThresholds: { two: 120, three: 190 },
        maxScore: 240,
      },
    });
  });
  await expect(page.getByTestId('results')).toBeVisible();
  const summary = page.getByTestId('results-summary-page');
  await expect(summary).toBeVisible();
  await expect(summary.getByText('wynik ponad 0')).toBeVisible();
  await expect(summary.getByText(/^od\s120\spkt$/)).toBeVisible();
  await expect(summary.getByText(/^od\s190\spkt$/)).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('results.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// Left-handed play mirrors the touch controls; the captions move to the right edge as before and
// still start under the band, and the HUD keeps clear of the bottom corners.
test('left-handed: captions stay right and under the band', async ({ browser }, testInfo) => {
  const player = await open(browser, testInfo, { leftHanded: true });
  const { page } = player;
  await startSolo(player);

  await expectBand(page);
  const captions = await box(page, CAPTIONS);
  // The fixed 10 rem offset under the event banners, as before S7-11.
  expect(captions.top).toBeGreaterThanOrEqual(168);
  expect(captions.right).toBeGreaterThan((page.viewportSize()?.width ?? 0) - 24);
  await page.screenshot({
    path: testInfo.outputPath('left-handed.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// Endless puts „Tempo ×N” inside the phone pill's row (a wider pill), not under it.
test('endless: the tempo chip sits inside the one-row pill', async ({ browser }, testInfo) => {
  const progress = { 'l1-burza': 3, 'l2-wybory': 3, 'l3-afera': 3, 'l4-zdrowie': 3 };
  const player = await open(browser, testInfo, {}, progress);
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
  await expectBand(page);
  await page.screenshot({
    path: testInfo.outputPath('endless.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// The queue holds as many cards as fit between the HUD pill and the menu button; the rest go
// on the "+N" chip. At 640×360 two cards fill it.
test('the folder queue fits between the pill and the menu button', async ({
  browser,
}, testInfo) => {
  const small = isSmall(testInfo);
  const player = await open(browser, testInfo);
  const { page } = player;
  await startSolo(player);

  const queue = page.getByTestId('hud-queue');
  for (const count of [0, 1, 2, 5]) {
    await pin(page, count);
    if (count === 0) {
      // The empty queue's wide ghost carries the words; it must fit the band as well.
      await expect(page.getByTestId('hud-next')).toHaveText(/^Nowa teczka za\s\d+\ss$/);
    } else if (count === 1) {
      await expect(queue.locator('[data-folder]')).toHaveCount(1);
      await expect(page.getByTestId('hud-next')).toBeVisible();
    } else if (count === 2) {
      await expect(queue.locator('[data-folder]')).toHaveCount(2);
      await expect(page.locator('[data-more]')).toHaveCount(0);
      // Beside the one-row pill (S7-11) 640 px holds two cards: no third slot for the ghost.
      await expect(page.getByTestId('hud-next')).toHaveCount(small ? 0 : 1);
    } else {
      await expect(queue.locator('[data-folder]').first()).toBeVisible();
      // Every folder is either a card or counted on the chip.
      await expect(page.locator('[data-more]')).toBeVisible();
      const cards = await page.locator('[data-folder]').count();
      await expect(page.locator('[data-more]')).toHaveText(`+${count - cards}`);
    }
    const area = await queue.boundingBox();
    const items = await queue.locator('li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    expect(area).not.toBeNull();
    for (const item of items) {
      expect(item.left).toBeGreaterThanOrEqual(area?.x ?? Number.NaN);
      expect(item.right).toBeLessThanOrEqual((area?.x ?? Number.NaN) + (area?.width ?? 0));
    }
    await page.screenshot({
      path: testInfo.outputPath(`queue-${count}.png`),
      scale: 'css',
      style: HIDE_PERF,
    });
  }
});

// S7-75: the main-menu footer („Prywatność”) sits in the scroll flow under both columns: a 48 px
// target inside the screen's width, under the card, never on top of it.
test('the menu footer link is reachable under the card', async ({ browser }, testInfo) => {
  const { page } = await open(browser, testInfo);
  const link = page.getByTestId('menu-footer').getByRole('link', { name: 'Prywatność' });
  await link.scrollIntoViewIfNeeded();
  await expect(link).toBeInViewport();
  const linkBox = await link.boundingBox();
  const field = await page.getByLabel('Twój podpis').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(linkBox).not.toBeNull();
  expect(field).not.toBeNull();
  if (!linkBox || !field) return;
  expect(linkBox.height).toBeGreaterThanOrEqual(48);
  expect(linkBox.x).toBeGreaterThanOrEqual(0);
  expect(linkBox.x + linkBox.width).toBeLessThanOrEqual(width);
  expect(linkBox.y).toBeGreaterThan(field.y + field.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
});
