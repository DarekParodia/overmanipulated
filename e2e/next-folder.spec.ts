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

type Hook = {
  getState(): { elapsedMs: number };
  map(): { fixtures: { id: string; kind: string }[] };
  inject(state: Record<string, unknown>): void;
};

/**
 * Opens a player with captions on (they are off by default), so the belt-full chip shows, plus
 * the given extra settings.
 */
async function openWithCaptions(
  browser: Browser,
  options: BrowserContextOptions,
  settings: Record<string, unknown> = {},
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((settings) => {
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ captions: true, ...settings }));
  }, settings);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

/**
 * Pins `count` folders on the conveyor and the next scheduled folder 20 s away (or a full belt)
 * over the server's snapshots, through the ?debug game hook.
 */
async function pin(page: Page, count: number, conveyorFull: boolean): Promise<void> {
  await page.evaluate(
    ({ count, conveyorFull }) => {
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
        conveyorFull,
      });
    },
    { count, conveyorFull },
  );
}

/** Background colour of a design token, as the browser computes it. */
function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement('div');
    probe.style.background = `var(${token})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, token);
}

async function startSolo(player: Player): Promise<void> {
  await createRoom(player);
  await player.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(player.page.getByTestId('hud')).toBeVisible();
}

// S7-09: a free queue slot shows the next scheduled folder as a dashed ghost card counting down;
// a full belt turns it and the conveyor sign orange. Desktop at 1366×768, phones on a Pixel 7.
// „20 s” is set with no-break spaces, hence `\s` in the patterns.
test('the next folder shows as a ghost card; a full belt turns orange', async ({
  browser,
}, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const player = await openWithCaptions(browser, touch ? PHONE : DESKTOP);
  const { page } = player;
  await startSolo(player);

  await pin(page, 1, false);
  const ghost = page.getByTestId('hud-next');
  await expect(ghost).toBeVisible();
  await expect(ghost).toHaveAttribute('data-state', 'in');
  await expect(ghost).toHaveAccessibleName('Następna teczka');
  await expect(ghost).toHaveText(/^\d+\ss$/);
  const conveyor = page.locator('[data-testid="station-sign"][data-kind="conveyor"]').first();
  await expect(conveyor).toHaveAttribute('data-state', 'incoming');
  await expect(conveyor.locator('span').filter({ hasText: /^za\s\d+\ss$/ })).toBeVisible();
  // The ghost sits inside the queue band, clear of the HUD pill and the screen tools.
  const band = await page.getByTestId('hud-queue').boundingBox();
  const card = await ghost.boundingBox();
  expect(band).not.toBeNull();
  expect(card).not.toBeNull();
  if (band && card) {
    expect(card.x).toBeGreaterThanOrEqual(band.x);
    expect(card.x + card.width).toBeLessThanOrEqual(band.x + band.width);
  }
  await page.screenshot({ path: testInfo.outputPath('ghost.png'), scale: 'css', style: HIDE_PERF });

  await pin(page, 1, true);
  // The cue's caption first: it stays up only 2.4 s.
  await expect(page.getByTestId('caption').filter({ hasText: 'Taśma pełna' })).toHaveCount(1);
  await expect(ghost).toHaveAttribute('data-state', 'full');
  await expect(ghost).toHaveText('Taśma pełna');
  await expect(ghost).toHaveAccessibleName('Taśma pełna');
  const orange = await tokenColor(page, '--orange');
  // The ghost's band (its first child) turns orange.
  await expect(ghost.locator('div').first()).toHaveCSS('background-color', orange);
  await expect(conveyor).toHaveAttribute('data-state', 'full');
  const signFull = conveyor.locator('span').filter({ hasText: /^Pełna$/ });
  await expect(signFull).toBeVisible();
  // So does the conveyor sign's name pill around „Pełna”.
  await expect(signFull.locator('..')).toHaveCSS('background-color', orange);
  await page.screenshot({ path: testInfo.outputPath('full.png'), scale: 'css', style: HIDE_PERF });

  // No free slot: three folders fill the queue and the ghost steps aside.
  await pin(page, 3, false);
  await expect(page.locator('[data-folder]')).toHaveCount(3);
  await expect(ghost).toHaveCount(0);

  // An empty queue says it in words.
  await pin(page, 0, false);
  await expect(ghost).toHaveText(/^Nowa teczka za\s\d+\ss$/);
  await page.screenshot({ path: testInfo.outputPath('empty.png'), scale: 'css', style: HIDE_PERF });
});

// The queue holds as many cards as fit between the HUD pill and the screen tools; the rest go
// on the "+N" chip. Checked at the smallest supported phone, 640×360.
test('the queue fits between the pill and the tools on a 640×360 phone', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name === 'desktop', 'phone layout');
  // Reduced motion: no pop-in scale, so the measured boxes are the laid-out ones.
  const player = await openWithCaptions(
    browser,
    { ...PHONE, viewport: { width: 640, height: 360 } },
    { reducedMotion: true },
  );
  const { page } = player;
  await startSolo(player);

  const queue = page.getByTestId('hud-queue');
  for (const count of [0, 2, 5]) {
    await pin(page, count, false);
    if (count === 0) {
      // The empty queue's wide ghost carries the words; it must fit the band as well.
      await expect(page.getByTestId('hud-next')).toHaveText(/^Nowa teczka za\s\d+\ss$/);
    } else if (count === 2) {
      await expect(queue.locator('[data-folder]')).toHaveCount(2);
      await expect(page.getByTestId('hud-next')).toBeVisible();
    } else {
      await expect(queue.locator('[data-folder]').first()).toBeVisible();
      // Every folder is either a card or counted on the chip.
      await expect(page.locator('[data-more]')).toBeVisible();
      const cards = await page.locator('[data-folder]').count();
      await expect(page.locator('[data-more]')).toHaveText(`+${count - cards}`);
    }
    const band = await queue.boundingBox();
    const items = await queue.locator('li').evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right };
      }),
    );
    expect(band).not.toBeNull();
    for (const item of items) {
      expect(item.left).toBeGreaterThanOrEqual(band?.x ?? Number.NaN);
      expect(item.right).toBeLessThanOrEqual((band?.x ?? Number.NaN) + (band?.width ?? 0));
    }
    await page.screenshot({
      path: testInfo.outputPath(`queue-${count}.png`),
      scale: 'css',
      style: HIDE_PERF,
    });
  }
});
