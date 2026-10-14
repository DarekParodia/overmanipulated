// S7-24: the room's difficulty reaches the client's minigame and guidance rules. On Ekspert a
// minigame clock starts at 15 s, the data library fails on the first mistake and shows no
// answer, the „co dalej” bubble stays away and a two-proof folder card shows only „×2”. Until
// the lobby picker lands (S7-25) the spec sends the host's `setDifficulty` over the page's own
// WebSocket, so the server deals the run on Ekspert exactly as the picker will.
import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  PHONE,
  skipStationHelp,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

const STATION_ID = 'expert-dataLibrary';
const FOLDER = {
  spawnKey: 's0',
  spawnedAtMs: 0,
  deadlineMs: 600_000,
  warned: false,
  stamps: [],
} as const;

/** Pins a data library this player operates in its minigame, and a two-proof folder on the belt. */
async function openLibrary(page: Page): Promise<void> {
  await page.evaluate(
    ({ id, folder }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      game.inject({
        stations: [
          {
            id,
            kind: 'dataLibrary',
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
            ...folder,
            id: 'f-library',
            storyId: 'l0-falszywa-straz',
            location: { kind: 'fixture', fixtureId: id },
          },
          {
            ...folder,
            id: 'f-two',
            spawnKey: 's1',
            storyId: 'l4-raport-pielegniarek',
            location: { kind: 'fixture', fixtureId: 'conveyor-0' },
          },
        ],
      });
    },
    { id: STATION_ID, folder: FOLDER },
  );
}

test('Ekspert: 15 s clock, one mistake, no answer, no hint bubble, ×2 on the card', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext(
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  // The first-game tutorial would cover the hint bubble; this player has seen it.
  await page.addInitScript(() => localStorage.setItem('redakcja.tutorial.done', '1'));
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    sockets.push(ws.connectToServer());
  });
  await page.goto('/?debug');
  await skipStationHelp(page);
  await page.getByLabel('Twój podpis').fill('Ewa');
  await createRoom({ page, nickname: 'Ewa', touch });

  // The host's lobby action, as the picker will send it; the start below follows it on the
  // same socket, so the run is dealt on Ekspert.
  const server = sockets.at(-1);
  expect(server).toBeDefined();
  server?.send(
    JSON.stringify({ type: 'lobby', action: { kind: 'setDifficulty', difficulty: 'expert' } }),
  );
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL leaves little real time for the 15 s clock; the overlay needs no scene.
  await page.addStyleTag({ content: 'canvas { display: none !important; }' });

  await openLibrary(page);
  const overlay = page.getByTestId('station-overlay');
  await expect(overlay.getByTestId('data-library')).toBeVisible();
  const clock = (await overlay.getByTestId('station-clock').getAttribute('aria-label')) ?? '';
  const seconds = Number(clock.match(/\d+/)?.[0] ?? Number.NaN);
  expect(seconds).toBeLessThanOrEqual(15);
  expect(seconds).toBeGreaterThanOrEqual(12);
  // One mistake allowed: a single mark.
  await expect(overlay.getByTestId('library-mistakes').locator('span')).toHaveCount(1);

  // The two-proof folder on the belt shows only how many proofs it needs.
  const evidence = page.locator('[data-folder="f-two"]').getByTestId('folder-evidence');
  await expect(evidence).toHaveAttribute('data-need', '2');
  await expect(evidence).not.toHaveAttribute('data-have', /.*/);
  await expect(evidence).toContainText('×2');

  // A wrong answer: „Nie pasuje” on a figure that fits, else any cell (an altered figure has
  // no matching cell). It fails the round at once and nothing gives the answer away.
  const verdict = await overlay.getByTestId('data-library').getAttribute('data-verdict');
  const result = await page.evaluate(async (match) => {
    const root = document.querySelector('[data-testid="station-overlay"]');
    const target = match ? 'library-mismatch' : 'library-cell-0-0';
    root?.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.click();
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return {
      banner: root?.querySelector('[data-testid="library-verdict"]')?.textContent ?? '',
      revealed: root?.querySelectorAll('[data-revealed="true"]').length ?? -1,
    };
  }, verdict === 'match');
  expect(result).toEqual({ banner: 'Pudło!', revealed: 0 });
  await page.screenshot({ path: testInfo.outputPath('expert-failure.png'), scale: 'css' });
  await expect(overlay).toBeHidden();

  // With folders waiting the guidance would point at them; on Ekspert there is no bubble.
  await page.waitForTimeout(600);
  await expect(page.getByTestId('guidance-hint')).toHaveCount(0);
});
