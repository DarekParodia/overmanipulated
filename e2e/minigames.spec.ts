// S7-56: the four Stage 7 minigames on desktop and on the smallest supported landscape phone
// (640×360, touch). On the styleguide bench (`/?styleguide`) every button is a big target
// (≥ 48 px both ways), nothing sticks out of the minigame or scrolls the page sideways, and the
// round is solved from the root's `data-answer`, so the check does not depend on the authored
// pools or on which outcome the seed rolls. In the station overlay every button sits above the
// fold of its scrolling body; only the key hints may need a scroll (Decision log, S7-15).
import { type BrowserContextOptions, expect, type Locator, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

/** The smallest touch target the design rules allow (px, both ways). */
const MIN_TARGET = 48;
/**
 * Allowed when comparing element edges (px): sub-pixel rounding plus the paper-cut tilt, e.g.
 * the Mapa photo's −1° turns its bounding box about 1.5 px wider than its layout box.
 */
const EDGE_SLACK = 3;

/** No story has a stamp for the four new stations before S7-57/S7-58; the puzzle rolls one. */
const OVERLAY_STORY = 'l0-zalany-rynek';

/** The test id of the button that gives `answer`. */
type Solver = (answer: string) => string;

/** The bench button (station name), the minigame's root test id and the answer → button id. */
const MINIGAMES: { kind: string; name: string; root: string; target: Solver }[] = [
  {
    kind: 'metadata',
    name: 'Metadane',
    root: 'metadata',
    target: (answer) => `metadata-${answer}`,
  },
  {
    kind: 'transcript',
    name: 'Stenogram',
    root: 'transcript',
    target: (answer) => `transcript-${answer}`,
  },
  {
    kind: 'crossCheck',
    name: 'Inne media',
    root: 'cross-check',
    target: (answer) => `cross-check-${answer}`,
  },
  {
    kind: 'geolocation',
    name: 'Mapa',
    root: 'geolocation',
    // The twelve districts are tiles 0..11; 12 is „Nie ma na mapie”.
    target: (answer) => (answer === '12' ? 'geolocation-not-here' : `geolocation-tile-${answer}`),
  },
];

/** Every button smaller than the minimum target, as "test id: w×h". */
async function smallTargets(root: Locator): Promise<string[]> {
  return root.locator('button').evaluateAll(
    (buttons, min) =>
      buttons
        .map((button) => {
          const rect = button.getBoundingClientRect();
          return { id: button.getAttribute('data-testid') ?? button.textContent, rect };
        })
        .filter(({ rect }) => Math.min(rect.width, rect.height) < min)
        .map(({ id, rect }) => `${id}: ${Math.round(rect.width)}×${Math.round(rect.height)}`),
    MIN_TARGET,
  );
}

/** Elements that stick out of the minigame sideways, plus page-level sideways scrolling. */
async function overflow(root: Locator): Promise<string[]> {
  return root.evaluate((el, slack) => {
    const box = el.getBoundingClientRect();
    const out: string[] = [];
    if (box.left < -slack || box.right > window.innerWidth + slack) {
      out.push(`root ${Math.round(box.left)}..${Math.round(box.right)}`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth + slack) {
      out.push(`page ${document.documentElement.scrollWidth}`);
    }
    for (const child of el.querySelectorAll('*')) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      if (rect.left < box.left - slack || rect.right > box.right + slack) {
        const id = child.getAttribute('data-testid') ?? child.className;
        out.push(`${child.tagName} ${id} ${Math.round(rect.left)}..${Math.round(rect.right)}`);
      }
    }
    return out;
  }, EDGE_SLACK);
}

/** Taps on touch, clicks otherwise. */
async function press(button: Locator, touch: boolean): Promise<void> {
  await button.scrollIntoViewIfNeeded();
  await (touch ? button.tap() : button.click());
}

/** Desktop at 1366×768, or a touch phone at 640×360; no motion, so nothing is mid-animation. */
function deviceOptions(touch: boolean): BrowserContextOptions {
  const size = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;
  return { ...size, reducedMotion: 'reduce' };
}

test('the four new minigames fit, have big targets and solve from data-answer', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext(deviceOptions(touch));
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?styleguide');
  const bench = page.getByTestId('minigame-bench');
  await bench.scrollIntoViewIfNeeded();

  for (const { kind, name, root: rootId, target } of MINIGAMES) {
    await press(bench.getByRole('button', { name, exact: true }), touch);
    const root = bench.getByTestId(rootId);
    await expect(root).toBeVisible();
    await expect(root.getByTestId('key-hints')).toHaveAttribute(
      'data-device',
      touch ? 'touch' : 'keyboard',
    );
    expect(await smallTargets(root), `${kind} targets`).toEqual([]);
    expect(await overflow(root), `${kind} overflow`).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${kind}.png`), scale: 'css' });

    // Solve: the Stenogram asks twice (find the clip, then judge it) unless the quote is
    // absent; every other minigame takes one answer.
    const answer = (await root.getAttribute('data-answer')) ?? '';
    await press(root.getByTestId(target(answer)), touch);
    if (kind === 'transcript' && answer !== 'absent') {
      await expect(root).toHaveAttribute('data-phase', 'judge');
      expect(await smallTargets(root), `${kind} judge targets`).toEqual([]);
      expect(await overflow(root), `${kind} judge overflow`).toEqual([]);
      await press(root.getByTestId(target((await root.getAttribute('data-answer')) ?? '')), touch);
    }
    await expect(bench.getByTestId('minigame-result')).toHaveText('success');
  }
});

type Hook = {
  localPlayerId(): string | null;
  inject(state: { stations: unknown[]; folders: unknown[] }): void;
};

test('in the station overlay every button of the new minigames is above the fold', async ({
  browser,
}, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const player = await openPlayer(browser, 'Zośka', deviceOptions(touch));
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  // Software WebGL leaves little real time for the minigame clock; the overlay needs no scene.
  await page.addStyleTag({ content: 'canvas { display: none !important; }' });
  const overlay = page.getByTestId('station-overlay');

  for (const { kind, root } of MINIGAMES) {
    // A station this player operates in the minigame phase, with a folder lying on it (the
    // ?debug hook pins it over server snapshots).
    await page.evaluate(
      ({ kind, storyId }) => {
        const game = (window as unknown as { __game: Hook }).__game;
        const id = `fold-${kind}`;
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
      { kind, storyId: OVERLAY_STORY },
    );
    await expect(overlay.getByTestId(root)).toBeVisible();
    // Every button's bottom edge is inside the visible part of the overlay (the frame clips its
    // scrolling body), with no scrolling.
    const hidden = await overlay.evaluate((frame, slack) => {
      const fold = Math.min(window.innerHeight, frame.getBoundingClientRect().bottom);
      return [...frame.querySelectorAll('button')]
        .map((button) => ({
          id: button.getAttribute('data-testid') ?? button.textContent,
          bottom: button.getBoundingClientRect().bottom,
        }))
        .filter(({ bottom }) => bottom > fold + slack)
        .map(({ id, bottom }) => `${id}: ${Math.round(bottom - fold)} px`);
    }, EDGE_SLACK);
    expect(hidden, `${kind} below the fold`).toEqual([]);
  }
});
