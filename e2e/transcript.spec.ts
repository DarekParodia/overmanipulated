// S7-53: the Stenogram plays through on every device. Desktop uses the keyboard (arrows over
// the 2×2 record, Space, Q for „Nie ma w zapisie”), phones tap at the smallest supported
// landscape size, 640×360. Each round reads the right target from the root's `data-answer`, so
// it does not depend on the authored pools. The two rounds are pinned to a meaning-changing cut
// and an invented quote (asserted through `data-variant`), so both the find → judge path and
// the absent path always run. Both stories are greybox stories without a Stenogram stamp, so the
// variant comes from the seed; a Stenogram stamp on either one must keep it. (Since S7-57 every
// level-5 story has a Stenogram stamp, and none of them is decisive on a false story.)
import { expect, type Page, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE } from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';
const LINES = 4;
const COLUMNS = 2;

/** Pins a Stenogram this player operates in its minigame, with the folder lying on it. */
async function openTranscript(page: Page, seed: number, storyId: string): Promise<void> {
  await page.evaluate(
    ({ seed, storyId }) => {
      const game = (window as unknown as { __game: Hook }).__game;
      const id = `transcript-${seed}`;
      game.inject({
        stations: [
          {
            id,
            kind: 'transcript',
            operatorId: game.localPlayerId(),
            phase: 'minigame',
            progressMs: 0,
            durationMs: 1000,
            minigameSeed: seed,
            lockoutMs: 0,
            outageMs: 0,
          },
        ],
        folders: [
          {
            id: `f-${seed}`,
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
    { seed, storyId },
  );
}

/** Keyboard: from the top-left line, walk the cursor to `target` and confirm it. */
async function keyboardPick(page: Page, target: string): Promise<void> {
  if (target === 'absent') {
    await page.keyboard.press('q');
    return;
  }
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowLeft']) {
    await page.keyboard.press(key);
  }
  const index = Number(target.replace('line-', ''));
  for (let row = 0; row < Math.floor(index / COLUMNS); row++) {
    await page.keyboard.press('ArrowDown');
  }
  if (index % COLUMNS === 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Space');
}

test('Stenogram: find the clip, judge the cut or answer „Nie ma w zapisie”', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const options = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
  const player = await openPlayer(browser, 'Zośka', options);
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL leaves little real time for the minigame clock; the overlay needs no scene.
  await page.addStyleTag({ content: 'canvas { display: none !important; }' });
  const overlay = page.getByTestId('station-overlay');

  const rounds = [
    { seed: 1, storyId: 'l0-zalany-rynek', variant: 'cut', wrongFirst: true },
    { seed: 2, storyId: 'l0-cytat-kandydatki', variant: 'absent', wrongFirst: false },
  ];
  for (const { seed, storyId, variant, wrongFirst } of rounds) {
    await openTranscript(page, seed, storyId);
    const root = overlay.getByTestId('transcript');
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute('data-phase', 'find');
    await expect(root).toHaveAttribute('data-variant', variant);
    const lines = root.locator('[data-testid^="transcript-line-"]');
    await expect(lines).toHaveCount(LINES);
    // Everything needed to play fits without scrolling, 640×360 included.
    for (let i = 0; i < LINES; i++) {
      await expect(lines.nth(i)).toBeInViewport({ ratio: 1 });
    }
    await expect(root.getByTestId('transcript-absent')).toBeInViewport({ ratio: 1 });
    await expect(root.getByTestId('key-hints')).toHaveAttribute(
      'data-device',
      touch ? 'touch' : 'keyboard',
    );
    const find = (await root.getAttribute('data-answer')) ?? '';
    expect(find).toMatch(/^(line-[0-3]|absent)$/);

    if (wrongFirst) {
      // A wrong line is struck through and costs one of the two mistakes.
      const answerIndex = find === 'absent' ? -1 : Number(find.replace('line-', ''));
      const wrong = root.getByTestId(`transcript-line-${(answerIndex + 1) % LINES}`);
      await (touch ? wrong.tap() : wrong.click());
      await expect(wrong).toHaveAttribute('data-struck', 'true');
      await expect(root).toHaveAttribute('data-phase', 'find');
    }

    if (touch) {
      await root.getByTestId(`transcript-${find}`).tap();
    } else {
      await keyboardPick(page, find);
    }

    if (find !== 'absent') {
      // Found: the line is highlighted, the cut words marked, and the judgement follows.
      await expect(root).toHaveAttribute('data-phase', 'judge');
      await expect(root.getByTestId(`transcript-${find}`)).toHaveAttribute('data-found', 'true');
      await expect(root.getByTestId('transcript-legend')).toBeVisible();
      const judgement = (await root.getAttribute('data-answer')) ?? '';
      expect(judgement).toMatch(/^(same|changed)$/);
      const button = root.getByTestId(`transcript-${judgement}`);
      await expect(button).toBeInViewport({ ratio: 1 });
      await page.screenshot({
        path: testInfo.outputPath(`judge-${seed}.png`),
        scale: 'css',
        style: HIDE_PERF,
      });
      if (touch) {
        await button.tap();
      } else {
        if (judgement === 'changed') {
          await page.keyboard.press('ArrowRight');
        }
        await page.keyboard.press('Space');
      }
    }

    await expect(root.getByTestId('transcript-verdict')).toContainText('Sprawdzone!');
    await page.screenshot({
      path: testInfo.outputPath(`done-${seed}.png`),
      scale: 'css',
      style: HIDE_PERF,
    });
    await expect(overlay).toBeHidden();
  }
});
