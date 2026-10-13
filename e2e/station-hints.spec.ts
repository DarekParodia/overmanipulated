import { expect, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE } from './helpers.ts';

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
] as const;

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

// S7-15: the key hints under every minigame follow the device in use; on touch they name the
// gesture or button. Phones are checked at the smallest supported landscape size, 640×360.
test('every minigame shows key hints for the device in use', async ({ browser }, testInfo) => {
  // Eight overlays and eight screenshots of a software-rendered WebGL page.
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const options = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
  const player = await openPlayer(browser, 'Zośka', options);
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL at about 1 fps under load lets a minigame clock run out before its hints are
  // read; the overlay needs no scene (as in difficulty-rules.spec.ts and transcript.spec.ts).
  await page.addStyleTag({ content: 'canvas { display: none !important; }' });

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
    const hints = overlay.getByTestId('key-hints');
    await expect(hints).toHaveAttribute('data-device', touch ? 'touch' : 'keyboard');
    // At 360 px tall the hints may sit below the fold of the overlay's scrolling body.
    await hints.scrollIntoViewIfNeeded();
    await expect(hints.locator('li').first()).toBeInViewport({ ratio: 0.9 });
    await page.screenshot({
      path: testInfo.outputPath(`${kind}.png`),
      scale: 'css',
      style: HIDE_PERF,
    });
  }
});
