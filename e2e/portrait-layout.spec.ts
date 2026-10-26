// Portrait phones (the `portrait` project, 360×640, and `portrait-tall`, 390×844): gameplay
// needs landscape and shows the rotate prompt, but the main menu, its dialogs, the lobby, the
// results page and the spectate screen work held upright. Nothing may widen the page or sit off its sides (a sideways
// scroller like the level path aside), touch targets stay 44 px, and the lobby's main action and
// the results' buttons are on screen without scrolling.
import { type BrowserContextOptions, devices, expect, type Page, test } from '@playwright/test';
import { closePlayers, createRoom, joinRoom, openPlayer, type Player } from './helpers.ts';

test.afterEach(closePlayers);

function portrait(viewport: { width: number; height: number } | undefined): BrowserContextOptions {
  return { ...devices['Pixel 7'], viewport: viewport ?? { width: 360, height: 640 } };
}

/**
 * Visible controls that stick out of the screen sideways or are smaller than a 44 px target,
 * and whether the page itself scrolls sideways. Controls inside a container that scrolls
 * sideways on purpose (the level path) are left out; range inputs are thin tracks with a big
 * thumb.
 */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const problems: string[] = [];
    if (document.scrollingElement && document.scrollingElement.scrollWidth > width + 1) {
      problems.push(`page scrolls sideways: ${document.scrollingElement.scrollWidth} px`);
    }
    const scrollsSideways = (element: Element): boolean => {
      for (let node = element.parentElement; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
          return true;
        }
      }
      return false;
    };
    for (const control of document.querySelectorAll('button, input, select, [role="button"]')) {
      const box = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      if (box.width === 0 || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        continue;
      }
      const name =
        control.getAttribute('data-testid') ??
        control.getAttribute('aria-label') ??
        control.textContent?.trim().slice(0, 24);
      if ((box.left < -1 || box.right > width + 1) && !scrollsSideways(control)) {
        problems.push(`${name} off screen: ${Math.round(box.left)}..${Math.round(box.right)}`);
      }
      const range = control instanceof HTMLInputElement && control.type === 'range';
      const hidden = control instanceof HTMLInputElement && box.width <= 1;
      if (!range && !hidden && (box.width < 44 || box.height < 44)) {
        problems.push(`${name} small: ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    return problems;
  });
}

async function expectOnScreen(page: Page, name: string | RegExp): Promise<void> {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  const viewport = page.viewportSize();
  expect(box, `${name} box`).not.toBeNull();
  if (box && viewport) {
    expect(box.y + box.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height + 1);
    expect(box.x + box.width, `${name} right`).toBeLessThanOrEqual(viewport.width + 1);
  }
}

async function open(
  browser: Parameters<typeof openPlayer>[0],
  viewport: { width: number; height: number } | undefined,
): Promise<Player> {
  return openPlayer(browser, 'Zośka', portrait(viewport));
}

test('the main menu and its dialogs fit a portrait phone', async ({ browser }, testInfo) => {
  const viewport = testInfo.project.use.viewport ?? undefined;
  const { page } = await open(browser, viewport);
  expect(await layoutProblems(page), 'main menu').toEqual([]);
  await expectOnScreen(page, 'Otwórz pokój');

  const dialogs: [string, () => Promise<void>][] = [
    ['settings', () => page.getByRole('button', { name: 'Ustawienia', exact: true }).click()],
    ['how to play', () => page.getByTestId('open-how-to').click()],
    ['about', () => page.getByTestId('open-about').click()],
    ['profile', () => page.getByTestId('open-profile').click()],
    ['room browser', () => page.getByTestId('open-room-browser').click()],
  ];
  for (const [name, show] of dialogs) {
    await show();
    await expect(page.locator('dialog[open]')).toBeVisible();
    // The sheets pop in; measure them where they land.
    await page.waitForTimeout(500);
    expect(await layoutProblems(page), name).toEqual([]);
    await page.reload();
    await page.getByLabel('Twój podpis').fill('Zośka');
  }
});

test('the lobby fits a portrait phone with its main action on screen', async ({
  browser,
}, testInfo) => {
  const player = await open(browser, testInfo.project.use.viewport ?? undefined);
  const { page } = player;
  await createRoom(player);
  expect(await layoutProblems(page), 'lobby').toEqual([]);
  // The action bar sticks to the bottom edge, so the host starts without scrolling.
  await expectOnScreen(page, 'Do składu!');
  // The top actions are icon only, one row under the room code.
  const leave = await page.getByRole('button', { name: 'Wyjdź' }).boundingBox();
  const settings = await page.getByRole('button', { name: 'Ustawienia' }).first().boundingBox();
  expect(leave && settings && Math.abs(leave.y - settings.y)).toBeLessThan(2);
});

test('gameplay asks to rotate, the results page works upright', async ({ browser }, testInfo) => {
  const player = await open(browser, testInfo.project.use.viewport ?? undefined);
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeAttached({ timeout: 30_000 });
  const prompt = page.getByRole('alert').filter({ hasText: 'Obróć telefon poziomo' });
  await expect(prompt).toBeVisible();

  await page.evaluate(() => {
    const result = (folderId: string, outcome: string, reason: string, scoreDelta: number) => ({
      folderId,
      spawnKey: `s${folderId.slice(1)}`,
      storyId: 'l0-zalany-rynek',
      outcome,
      reason,
      verdict: outcome === 'expired' ? null : 'reject',
      scoreDelta,
      credibilityDelta: 0,
      justifyingStampIds: [],
      requiredStamps: 1,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    });
    const game = (window as unknown as { __game: { setState(state: object): void } }).__game;
    game.setState({
      levelEnd: {
        type: 'levelEnd',
        levelId: 'l0-greybox',
        won: true,
        stars: 1,
        score: 20,
        credibility: 60,
        results: [
          result('f1', 'correct', 'correctImportant', 25),
          result('f2', 'expired', 'expired', -5),
        ],
        lossReason: null,
        starThresholds: { two: 120, three: 190 },
        maxScore: 240,
      },
    });
  });
  await expect(page.getByTestId('results')).toBeVisible();
  await expect(prompt).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(await layoutProblems(page), 'results').toEqual([]);
  await expectOnScreen(page, 'Wróć do redakcji');
  await expectOnScreen(page, 'Wyjdź z redakcji');
});

test('a spectator watches upright: the lobby, the bar and the footer fit', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const host = await openPlayer(browser, 'Zośka', { viewport: { width: 1280, height: 720 } });
  const watcher = await open(browser, testInfo.project.use.viewport ?? undefined);
  const lobby = (page: Page, action: object) =>
    page.evaluate((a) => {
      (window as unknown as { __session: { lobby(a: unknown): void } }).__session.lobby(a);
    }, action);
  const code = await createRoom(host);
  await lobby(host.page, { kind: 'setSpectatorsAllowed', allowed: true });
  await joinRoom(watcher, code, { ready: false });
  await lobby(watcher.page, { kind: 'setSpectator', spectator: true });
  await expect(host.page.getByRole('button', { name: 'Do składu!' })).toBeEnabled();
  // A guest's level card stays compact in the sticky action bar.
  expect(await layoutProblems(watcher.page), 'spectator lobby').toEqual([]);

  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  const screen = watcher.page.getByTestId('spectate-screen');
  await expect(screen).toBeVisible({ timeout: 40_000 });
  // Watching is not playing: no rotate prompt.
  await expect(watcher.page.getByText('Obróć telefon poziomo')).toHaveCount(0);
  expect(await layoutProblems(watcher.page), 'spectate screen').toEqual([]);
  // The score and the clock in the top bar do not overlap.
  const score = await watcher.page.getByTestId('spectate-score-0').boundingBox();
  const clock = await watcher.page.getByRole('timer').boundingBox();
  expect(score && clock && score.x + score.width).toBeLessThanOrEqual((clock?.x ?? 0) + 1);
  await expectOnScreen(watcher.page, 'Wyjdź');
});
