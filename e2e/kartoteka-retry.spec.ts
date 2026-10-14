import { expect, type Page, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  openPlayer,
  PHONE,
  skipStationHelp,
} from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

const STATION_ID = 'retry-sourceRegistry';
// Seed 2 on this story (a decisive Kartoteka stamp on an untrue post) gives a card with warning
// signs on fields 0, 2 and 5; the other fields are clean.
const SEED = 2;
const STORY_ID = 'l0-falszywa-straz';

/** Pins the Kartoteka station this player operates in `phase` over the server's snapshots. */
async function setStation(page: Page, phase: 'idle' | 'minigame' | 'lockout'): Promise<void> {
  await page.evaluate(
    ({ phase, id, seed, storyId }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      game.inject({
        stations: [
          {
            id,
            kind: 'sourceRegistry',
            operatorId: phase === 'minigame' ? game.localPlayerId() : null,
            phase,
            progressMs: 0,
            durationMs: 1000,
            minigameSeed: seed,
            lockoutMs: phase === 'lockout' ? 3000 : 0,
            outageMs: 0,
          },
        ],
        folders: [
          {
            id: 'f-retry',
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
    { phase, id: STATION_ID, seed: SEED, storyId: STORY_ID },
  );
  // Let the station layer see the phase before the next one is pinned.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

/** Whole seconds on the overlay clock („Zostało 12 s”). */
async function clockSeconds(page: Page): Promise<number> {
  const label = (await page.getByTestId('station-clock').getAttribute('aria-label')) ?? '';
  return Number(label.match(/\d+/)?.[0] ?? Number.NaN);
}

/**
 * Clicks the given controls of the card in one go and reads what the card shows a frame later:
 * a filed or failed card stays up for about a second only.
 */
async function clickAndRead(page: Page, testIds: readonly string[]) {
  return page.evaluate(async (ids) => {
    const overlay = document.querySelector('[data-testid="station-overlay"]');
    const byId = (id: string) => overlay?.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    for (const id of ids) {
      byId(id)?.click();
    }
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const fields = Array.from({ length: 7 }, (_, i) => byId(`source-field-${i}`));
    return {
      verdict: byId('source-verdict')?.textContent ?? '',
      missed: overlay?.querySelectorAll('[data-missed]').length ?? -1,
      // Fields with the round „!” badge (circled warning signs), as 0/1 per field.
      badges: fields.map((f) => (f?.querySelector('[aria-hidden="true"]') ? 1 : 0)).join(''),
      struck: fields.map((f) => (f?.dataset.struck === 'true' ? 1 : 0)).join(''),
    };
  }, testIds);
}

// S7-14: a failed Kartoteka card comes back after the lockout as the same card, with the
// player's circles kept, mistakes cleared and no answer revealed; a card put down unfinished
// comes back with the clock it had left; a filed card is forgotten.
test('the Kartoteka card comes back with its circles and without the answer', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const options = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
  const player = await openPlayer(browser, 'Zośka', options);
  const { page } = player;
  await skipStationHelp(page);
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL draws the newsroom at a few frames per second, which leaves the 20 s card
  // clock too little real time for the test's steps; the overlay does not need the scene.
  await page.addStyleTag({ content: 'canvas { display: none !important; }' });

  await setStation(page, 'minigame');
  const overlay = page.getByTestId('station-overlay');
  const field = (i: number) => overlay.getByTestId(`source-field-${i}`);
  await expect(overlay.getByTestId('source-registry')).toBeVisible();
  await expect(overlay).toContainText('Zakreśl podejrzane wpisy, potem odłóż kartę');

  // One warning sign circled, then two clean fields: the second mistake fails the card. The
  // missed warning signs (fields 2 and 5) stay unmarked: no answer is revealed.
  await field(0).click();
  await expect(field(0)).toHaveAttribute('data-circled', 'true');
  const failed = await clickAndRead(page, ['source-field-1', 'source-field-3']);
  expect(failed).toEqual({
    verdict: 'Źle zakreśloneKarta na ciebie poczeka.',
    missed: 0,
    badges: '1000000',
    struck: '0101000',
  });
  await expect(overlay).toBeHidden();
  await expect(page.getByTestId('lockout-note')).toBeVisible();

  // After the lockout the server reopens the same card (same seed): circles kept, mistakes and
  // crossed-out fields cleared, and a full clock.
  await setStation(page, 'lockout');
  await setStation(page, 'minigame');
  await expect(overlay.getByTestId('source-registry')).toBeVisible();
  await expect(overlay).toContainText('Ta sama karta: dokończ zakreślanie');
  await expect(field(0)).toHaveAttribute('data-circled', 'true');
  await expect(field(1)).toHaveAttribute('data-struck', 'false');
  await expect(field(3)).toHaveAttribute('data-struck', 'false');
  await expect(overlay.getByTestId('source-mistakes')).toHaveAttribute('data-count', '0');
  expect(await clockSeconds(page)).toBeGreaterThanOrEqual(18);
  await page.screenshot({ path: testInfo.outputPath('retry.png'), scale: 'css' });

  // Put the card down after a few seconds: it comes back with the clock it had left.
  await field(2).click();
  await expect(field(2)).toHaveAttribute('data-circled', 'true');
  await page.waitForTimeout(3000);
  const left = await clockSeconds(page);
  await overlay.getByTestId('overlay-close').click();
  await expect(overlay).toBeHidden();
  await setStation(page, 'idle');
  await setStation(page, 'minigame');
  await expect(overlay.getByTestId('source-registry')).toBeVisible();
  await expect(field(0)).toHaveAttribute('data-circled', 'true');
  await expect(field(2)).toHaveAttribute('data-circled', 'true');
  const resumed = await clockSeconds(page);
  expect(resumed).toBeLessThanOrEqual(left);
  expect(resumed).toBeLessThanOrEqual(17);
  expect(resumed).toBeGreaterThanOrEqual(5);

  // Filing the card with every warning sign circled succeeds, and the card is forgotten.
  const filed = await clickAndRead(page, ['source-field-5', 'source-file']);
  expect(filed.verdict).toContain('Sprawdzone!');
  await expect(overlay).toBeHidden();
  await setStation(page, 'idle');
  await setStation(page, 'minigame');
  await expect(overlay).toContainText('Zakreśl podejrzane wpisy, potem odłóż kartę');
  await expect(field(0)).toHaveAttribute('data-circled', 'false');
  expect(await clockSeconds(page)).toBeGreaterThanOrEqual(18);
});
