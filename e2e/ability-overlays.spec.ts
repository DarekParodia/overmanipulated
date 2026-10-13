// S7-41: role abilities around the station overlays. The header's Ekspertyza button (key cap on
// desktop, icon only at 640x360) and R inside the overlay, and the round nonce: a Kartoteka
// round that fails with Druga szansa armed (lockoutMs 0) hides the lockout plate and reopens the
// same card on the next minigameStarted, although the station and its seed never change. The
// station and folder are pinned through the ?debug game hook; the events are replayed as if
// they came from the server.
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
  skipStationHelp,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };
const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
  emit(event: unknown): void;
};

async function open(browser: Browser, options: BrowserContextOptions): Promise<Player> {
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
  await skipStationHelp(page);
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

async function startSolo(player: Player, role: string | null): Promise<void> {
  await createRoom(player);
  if (role) {
    await pickRole(player, role);
  }
  await player.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(player.page.getByTestId('hud')).toBeVisible();
  // Software WebGL draws the newsroom at a few frames per second; the overlay needs no scene.
  await player.page.addStyleTag({ content: 'canvas { display: none !important; }' });
}

/** Pins one station the local player operates (or not) with a folder lying on it. */
async function pinStation(
  page: Page,
  station: { id: string; kind: string; seed: number; storyId: string },
  phase: 'idle' | 'minigame',
): Promise<void> {
  await page.evaluate(
    ({ station, phase }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      game.inject({
        stations: [
          {
            id: station.id,
            kind: station.kind,
            operatorId: phase === 'minigame' ? game.localPlayerId() : null,
            phase,
            progressMs: 0,
            durationMs: 1000,
            minigameSeed: station.seed,
            lockoutMs: 0,
            outageMs: 0,
          },
        ],
        folders: [
          {
            id: 'f-ability',
            spawnKey: 's0',
            storyId: station.storyId,
            location: { kind: 'fixture', fixtureId: station.id },
            stamps: [],
            spawnedAtMs: 0,
            deadlineMs: 600_000,
            warned: false,
          },
        ],
      });
    },
    { station, phase },
  );
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

async function emit(page: Page, event: Record<string, unknown>): Promise<void> {
  await page.evaluate((event) => {
    const game = (window as unknown as { __game: Hook }).__game;
    game.emit({ ...event, playerId: game.localPlayerId() });
  }, event);
}

type Box = { top: number; bottom: number; left: number; right: number };

async function box(page: Page, testId: string): Promise<Box> {
  return page.getByTestId(testId).evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

const IMAGE = { id: 'e2e-imageSearch', kind: 'imageSearch', seed: 7, storyId: 'l0-zalany-rynek' };
const ARCHIVE = { id: 'e2e-archive', kind: 'archive', seed: 7, storyId: 'l0-zalany-rynek' };

test('desktop: the header offers Ekspertyza with R, which settles the round', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard header button');
  test.slow();
  const player = await open(browser, DESKTOP);
  const { page } = player;
  await startSolo(player, 'Fotoedytor');

  await pinStation(page, IMAGE, 'minigame');
  const overlay = page.getByTestId('station-overlay');
  const button = overlay.getByTestId('station-expertise');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Ekspertyza');
  await expect(button).toContainText('Ekspert');
  await expect(button).toContainText('R');
  // Header order: title, time bar, Ekspertyza, back key, close; nothing overlaps.
  const own = await box(page, 'station-expertise');
  const close = await box(page, 'overlay-close');
  const clock = await box(page, 'station-clock');
  expect(own.right).toBeLessThanOrEqual(close.left);
  expect(own.left).toBeGreaterThanOrEqual(clock.right);
  expect(overlaps(own, close)).toBe(false);
  expect(own.right).toBeLessThanOrEqual(1366);
  await page.screenshot({
    path: testInfo.outputPath('desktop-expertise.png'),
    scale: 'css',
    style: HIDE_PERF,
  });

  // R reaches the frame as the nav intent: the round settles and waits for the stamp.
  await page.keyboard.press('KeyR');
  await expect(button).toHaveAttribute('data-sending', 'true');
  await expect(button).toHaveAccessibleName('Ekspertyza…');
  await expect(button).toBeDisabled();
  // The server stamps the folder and frees the station: the overlay closes.
  await pinStation(page, IMAGE, 'idle');
  await expect(overlay).toBeHidden();
});

test('640x360 touch: the Ekspertyza header button is icon only and tappable', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch header button');
  const player = await open(browser, SMALL_PHONE);
  const { page } = player;
  await startSolo(player, 'Archiwista');

  await pinStation(page, ARCHIVE, 'minigame');
  const button = page.getByTestId('station-overlay').getByTestId('station-expertise');
  await expect(button).toBeVisible();
  await expect(button).toHaveAccessibleName('Ekspertyza');
  const own = await box(page, 'station-expertise');
  const close = await box(page, 'overlay-close');
  // A 48 px round target inside the viewport, clear of the close button.
  expect(Math.round(own.right - own.left)).toBe(48);
  expect(Math.round(own.bottom - own.top)).toBe(48);
  expect(own.left).toBeGreaterThanOrEqual(0);
  expect(own.right).toBeLessThanOrEqual(640);
  expect(overlaps(own, close)).toBe(false);
  await expect(button.getByText('Ekspert')).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath('phone-expertise.png'),
    scale: 'css',
    style: HIDE_PERF,
  });

  await button.tap();
  await expect(button).toHaveAttribute('data-sending', 'true');
});

const KARTOTEKA = {
  id: 'e2e-sourceRegistry',
  kind: 'sourceRegistry',
  // Seed 2 on this story gives warning signs on fields 0, 2 and 5 (kartoteka-retry.spec.ts).
  seed: 2,
  storyId: 'l0-falszywa-straz',
};

test('Druga szansa: lockoutMs 0 hides the plate and the same card reopens', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one device is enough for the round logic');
  test.slow();
  const player = await open(browser, DESKTOP);
  const { page } = player;
  await startSolo(player, null);

  await pinStation(page, KARTOTEKA, 'minigame');
  const overlay = page.getByTestId('station-overlay');
  const field = (i: number) => overlay.getByTestId(`source-field-${i}`);
  await expect(overlay.getByTestId('source-registry')).toBeVisible();
  // One warning sign circled, then two clean fields: the second mistake fails the card.
  await field(0).click();
  await expect(field(0)).toHaveAttribute('data-circled', 'true');
  await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="station-overlay"]');
    for (const id of ['source-field-1', 'source-field-3']) {
      overlay?.querySelector<HTMLElement>(`[data-testid="${id}"]`)?.click();
    }
  });
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('lockout-note')).toBeVisible();

  // The server answers with Druga szansa: no lockout, then the same round starts again on the
  // same station with the same seed (the Kartoteka keeps its card).
  await emit(page, {
    kind: 'minigameFailed',
    stationId: KARTOTEKA.id,
    folderId: 'f-ability',
    lockoutMs: 0,
  });
  await expect(page.getByTestId('lockout-note')).toBeHidden();
  await expect(overlay).toBeHidden();
  await emit(page, {
    kind: 'minigameStarted',
    stationId: KARTOTEKA.id,
    station: KARTOTEKA.kind,
    folderId: 'f-ability',
    seed: KARTOTEKA.seed,
  });
  await expect(overlay.getByTestId('source-registry')).toBeVisible();
  await expect(overlay).toContainText('Ta sama karta: dokończ zakreślanie');
  await expect(field(0)).toHaveAttribute('data-circled', 'true');
  // No ability without a role: the header stays as it was.
  await expect(overlay.getByTestId('station-expertise')).toHaveCount(0);
});
