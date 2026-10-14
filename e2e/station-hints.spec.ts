import { expect, type Locator, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  GAME_READY_TIMEOUT_MS,
  hideScene,
  openPlayer,
  PHONE,
  skipStationHelp,
} from './helpers.ts';

test.afterEach(closePlayers);

/** Each minigame's root test id and a story that has a stamp for that station. */
const MINIGAMES = [
  { kind: 'imageSearch', root: 'image-search', storyId: 'l0-zalany-rynek' },
  { kind: 'archive', root: 'archive-minigame', storyId: 'l0-zalany-rynek' },
  { kind: 'sourceRegistry', root: 'source-registry', storyId: 'l0-zalany-rynek' },
  { kind: 'phone', root: 'phone', storyId: 'l3-dzien-otwarty' },
  { kind: 'aiScanner', root: 'ai-scanner', storyId: 'l5-nagranie-podatek' },
  { kind: 'dataLibrary', root: 'data-library', storyId: 'l4-dziewiec-na-dziesiec' },
  // No story carries a Metadane stamp before S7-57; the puzzle then rolls its own outcome.
  { kind: 'metadata', root: 'metadata', storyId: 'l5-nagranie-podatek' },
  // Likewise no Stenogram stamp before S7-57.
  { kind: 'transcript', root: 'transcript', storyId: 'l5-nagranie-podatek' },
  // No Mapa stamp before S7-58 either.
  { kind: 'geolocation', root: 'geolocation', storyId: 'l5-nagranie-podatek' },
  // No story carries an Inne media stamp before S7-58 either.
  { kind: 'crossCheck', root: 'cross-check', storyId: 'l0-zalany-rynek' },
] as const;

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

/**
 * What does not fit the station overlay without scrolling: the body's overflow, and every
 * button or hint row that sticks out of the body's visible box or the viewport (1 px slack).
 */
async function misfits(overlay: Locator): Promise<string[]> {
  return overlay.evaluate((frame) => {
    const body = frame.querySelector<HTMLElement>('[data-testid="overlay-body"]');
    if (!body) {
      return ['no overlay body'];
    }
    const out: string[] = [];
    if (body.scrollHeight > body.clientHeight + 1) {
      out.push(`body scrolls ${body.scrollHeight - body.clientHeight} px`);
    }
    const box = body.getBoundingClientRect();
    const top = Math.max(0, box.top);
    const bottom = Math.min(window.innerHeight, box.bottom);
    const left = Math.max(0, box.left);
    const right = Math.min(window.innerWidth, box.right);
    for (const el of body.querySelectorAll('button, [data-testid="key-hints"]')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      if (
        rect.top < top - 1 ||
        rect.bottom > bottom + 1 ||
        rect.left < left - 1 ||
        rect.right > right + 1
      ) {
        const id = el.getAttribute('data-testid') ?? el.textContent;
        out.push(
          `${id}: ${Math.round(rect.left)},${Math.round(rect.top)}..${Math.round(rect.right)},${Math.round(rect.bottom)}`,
        );
      }
    }
    return out;
  });
}

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

// S7-15: the key hints under every minigame follow the device in use; on touch they name the
// gesture or button. Checked at the smallest supported sizes: 640×360 phones, 1280×720 desktops.
test('every minigame shows key hints for the device in use', async ({ browser }, testInfo) => {
  // Ten overlays and ten screenshots of a software-rendered WebGL page.
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const options = touch
    ? { ...PHONE, viewport: { width: 640, height: 360 } }
    : { ...DESKTOP, viewport: { width: 1280, height: 720 } };
  const player = await openPlayer(browser, 'Zośka', options);
  const { page } = player;
  await skipStationHelp(page);
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible({ timeout: GAME_READY_TIMEOUT_MS });
  // Software WebGL at about 1 fps under load lets a minigame clock run out before its hints are
  // read; the overlay needs no scene (as in difficulty-rules.spec.ts and transcript.spec.ts).
  await hideScene(page);

  for (const { kind, root, storyId } of MINIGAMES) {
    // Open the station overlay locally: a station this player operates in the minigame phase,
    // with the folder lying on it (the ?debug hook pins it over server snapshots).
    await page.evaluate(
      ({ kind, storyId }) => {
        const game = (window as unknown as { __game: Hook }).__game;
        const id = `hints-${kind}`;
        game.inject({
          stations: [
            {
              id,
              kind,
              operatorId: game.localPlayerId(),
              phase: 'minigame',
              progressMs: 0,
              durationMs: 1000,
              minigameSeed: 7,
              lockoutMs: 0,
              outageMs: 0,
            },
          ],
          folders: [
            {
              id: `f-${kind}`,
              spawnKey: 's0',
              storyId,
              location: { kind: 'fixture', fixtureId: id },
              stamps: [],
              spawnedAtMs: 0,
              deadlineMs: 600_000,
              warned: false,
            },
          ],
        });
      },
      { kind, storyId },
    );
    const overlay = page.getByTestId('station-overlay');
    await expect(overlay.getByTestId(root)).toBeVisible();
    if (kind === 'geolocation') {
      // S7-55: the twelve districts and „Nie ma na mapie” are big enough to tap (≥ 48 px) even at
      // 640×360. One round trip: under load the 20 s minigame clock keeps running.
      const targets = overlay.locator(
        '[data-testid^="geolocation-tile-"], [data-testid="geolocation-not-here"]',
      );
      const sizes = await targets.evaluateAll((els) =>
        els.map((el) => {
          const rect = el.getBoundingClientRect();
          return Math.min(rect.width, rect.height);
        }),
      );
      expect(sizes).toHaveLength(13);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(48);
    }
    const hints = overlay.getByTestId('key-hints');
    await expect(hints).toHaveAttribute('data-device', touch ? 'touch' : 'keyboard');
    // At the smallest supported sizes (640×360 touch, 1280×720 desktop) the overlay body does
    // not scroll, and every button and the hint row lie inside the body and the viewport.
    expect(
      await misfits(overlay),
      `${kind} at ${options.viewport?.width}×${options.viewport?.height}`,
    ).toEqual([]);
    await expect(hints.locator('li').first()).toBeInViewport({ ratio: 0.9 });
    await page.screenshot({
      path: testInfo.outputPath(`${kind}.png`),
      scale: 'css',
      style: HIDE_PERF,
    });
  }
});
