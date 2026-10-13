// S7-57: level 5 „Głęboka podróbka” in its 24×14 room plays in two tabs. The server builds the
// room with Stenogram and Metadane, both players get the same map, and each new station opens
// its real minigame (never the placeholder) with the puzzle its l5 stamp asks for.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  closePlayers,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
  type Player,
  skipStationHelp,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  localPlayerId(): string | null;
  map(): {
    width: number;
    height: number;
    fixtures: { id: string; kind: string; station?: string }[];
  };
  getState(): { stations: { id: string; kind: string }[] };
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

/** Levels 1–4 won, so level 5 is open on this browser. */
const PROGRESS = { 'l1-burza': 3, 'l2-wybory': 3, 'l3-afera': 3, 'l4-zdrowie': 3 };

async function openHost(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((progress) => {
    localStorage.setItem('redakcja.progress.v1', JSON.stringify(progress));
  }, PROGRESS);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

/** The room as this tab sees it: size, its station fixtures and the server's station kinds. */
async function room(page: Page) {
  return page.evaluate(() => {
    const game = (window as unknown as { __game: Hook }).__game;
    const map = game.map();
    return {
      size: [map.width, map.height],
      fixtures: map.fixtures.filter((f) => f.kind === 'station').map((f) => f.id),
      stations: game
        .getState()
        .stations.map((s) => s.kind)
        .sort(),
    };
  });
}

/** Pins the room's own `fixtureId` station in its minigame for this player, with a l5 folder. */
async function openStation(
  page: Page,
  fixtureId: string,
  kind: string,
  storyId: string,
): Promise<void> {
  await page.evaluate(
    ({ fixtureId, kind, storyId }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      game.inject({
        stations: [
          {
            id: fixtureId,
            kind,
            operatorId: game.localPlayerId(),
            phase: 'minigame',
            progressMs: 0,
            durationMs: 1000,
            minigameSeed: 3,
            lockoutMs: 0,
            outageMs: 0,
          },
        ],
        folders: [
          {
            id: `f-${fixtureId}`,
            spawnKey: 's0',
            storyId,
            location: { kind: 'fixture', fixtureId },
            stamps: [],
            spawnedAtMs: 0,
            deadlineMs: 600_000,
            warned: false,
          },
        ],
      });
    },
    { fixtureId, kind, storyId },
  );
}

test('level 5 runs in the 24×14 room with Stenogram and Metadane in two tabs', async ({
  browser,
}, testInfo) => {
  test.slow();
  // Phones at the smallest supported landscape size.
  const options =
    testInfo.project.name === 'desktop'
      ? DESKTOP
      : { ...PHONE, viewport: { width: 640, height: 360 } };
  const host = await openHost(browser, options);
  const guest = await openPlayer(browser, 'Łukasz', options);
  // Both tabs open stations straight on their minigames (no first-use help card, S7-95).
  await skipStationHelp(host.page);
  await skipStationHelp(guest.page);
  await host.page.getByRole('button', { name: 'Otwórz pokój' }).click();
  const code = host.page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z]{4}$/);
  await host.page.getByTestId('level-tile-l5-deepfake').click();
  await expect(host.page.getByTestId('level-card')).toContainText('Głęboka podróbka');
  await joinRoom(guest, (await code.textContent()) ?? '');
  await expect(guest.page.getByTestId('level-card')).toContainText('Głęboka podróbka');
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  // Software WebGL on a loaded machine starves two tabs; the checks below need no scene.
  for (const player of [host, guest]) {
    await player.page.addStyleTag({ content: 'canvas { display: none !important; }' });
  }

  const fixtures = [
    'imageSearch-0',
    'aiScanner-0',
    'sourceRegistry-0',
    'transcript-0',
    'archive-0',
    'phone-0',
    'metadata-0',
  ];
  const kinds = [
    'aiScanner',
    'archive',
    'imageSearch',
    'metadata',
    'phone',
    'sourceRegistry',
    'transcript',
  ];
  for (const player of [host, guest]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
    await expect
      .poll(() => room(player.page))
      .toEqual({ size: [24, 14], fixtures, stations: kinds });
  }

  // The cut quote is now decided at the Stenogram; the old photo's date at Metadane.
  const rounds = [
    { player: host, fixtureId: 'transcript-0', kind: 'transcript', storyId: 'l5-wyciety-cytat' },
    { player: guest, fixtureId: 'metadata-0', kind: 'metadata', storyId: 'l5-zdjecie-sprzed-lat' },
  ];
  for (const { player, fixtureId, kind, storyId } of rounds) {
    await openStation(player.page, fixtureId, kind, storyId);
    const overlay = player.page.getByTestId('station-overlay');
    const root = overlay.getByTestId(kind);
    await expect(root).toBeVisible();
    if (kind === 'transcript') {
      await expect(root).toHaveAttribute('data-variant', 'cut');
    } else {
      await expect(root).toHaveAttribute('data-outcome', 'contradiction');
      // An old photo under a new caption gives itself away by its date, as its stamp says.
      await expect(root).toHaveAttribute('data-answer', 'taken');
    }
    await expect(root.getByTestId('key-hints')).toHaveAttribute(
      'data-device',
      player.touch ? 'touch' : 'keyboard',
    );
  }
});
