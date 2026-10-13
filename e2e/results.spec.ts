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
const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };

type Hook = { setState(state: Record<string, unknown>): void };

function result(
  folderId: string,
  storyId: string,
  outcome: string,
  reason: string,
  verdict: string | null,
  scoreDelta: number,
  credibilityDelta: number,
  speed = 0,
) {
  return {
    folderId,
    spawnKey: `s${folderId.slice(1)}`,
    storyId,
    outcome,
    reason,
    verdict,
    scoreDelta,
    credibilityDelta,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

/** The results design fixture (S7-05): six folders, 15 points, one star of three. */
const LEVEL_END = {
  type: 'levelEnd',
  levelId: 'l0-greybox',
  won: true,
  stars: 1,
  score: 15,
  credibility: 45,
  results: [
    result('f1', 'l0-zalany-rynek', 'correct', 'correctImportant', 'reject', 25, 5, 5),
    result('f2', 'l0-nocny-autobus', 'correct', 'correctNormal', 'publish', 10, 0),
    result('f3', 'l0-zalany-rynek', 'wrong', 'publishedFake', 'publish', -20, -25),
    result('f4', 'l0-nocny-autobus', 'wrongJustification', 'weakProof', 'publish', 5, 0),
    result('f5', 'l0-zalany-rynek', 'expired', 'expired', null, -5, -5),
    result('f6', 'l0-nocny-autobus', 'unfinished', 'unfinished', null, 0, 0),
  ],
  lossReason: null,
  starThresholds: { two: 120, three: 190 },
  maxScore: 240,
};

async function open(
  browser: Browser,
  options: BrowserContextOptions,
  reducedMotion: boolean,
): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((reducedMotion) => {
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ reducedMotion }));
  }, reducedMotion);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

/** Starts a solo level and ends it with a fixture (the design one by default) through the
 * ?debug game hook. */
async function showResults(player: Player, levelEnd: object = LEVEL_END): Promise<Page> {
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.evaluate((levelEnd) => {
    (window as unknown as { __game: Hook }).__game.setState({ levelEnd });
  }, levelEnd);
  await expect(page.getByTestId('results')).toBeVisible();
  return page;
}

/** The summary: star captions, the progress line and every totals row with its points. */
async function expectSummary(page: Page, variant: 'column' | 'page'): Promise<void> {
  const summary = page.getByTestId(`results-summary-${variant}`);
  await expect(summary).toBeVisible();
  await expect(summary.getByText('wynik ponad 0')).toBeVisible();
  await expect(summary.getByText(/^od\s120\spkt$/)).toBeVisible();
  await expect(summary.getByText(/^od\s190\spkt$/)).toBeVisible();
  await expect(page.getByTestId('results-progress')).toBeVisible();
  await expect(page.getByTestId('results-progress')).toContainText(/brakuje 105\spkt/);
  const totals = page.getByTestId('results-totals');
  const rows = totals.locator('tbody tr');
  await expect(rows).toHaveCount(6);
  for (const [id, points] of [
    ['correct', '+30'],
    ['speed', '+5'],
    ['weakProof', '+5'],
    ['wrong', '−20'],
    ['expired', '−5'],
    ['unfinished', '0'],
  ] as const) {
    const row = totals.locator(`tr[data-row="${id}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(1)).toHaveText(points);
  }
  await expect(totals.locator('tfoot')).toContainText('Razem');
  await expect(totals.locator('tfoot')).toContainText('15');
}

// S7-06: with reduced motion the whole summary is there at once — the star captions, the
// points to the next star and the totals table. Desktop at 1366×768, phones at 640×360 (where
// the summary is the Kolegium's first page, „Podsumowanie”).
test('reduced motion shows the summary at once', async ({ browser }, testInfo) => {
  const phone = testInfo.project.name !== 'desktop';
  const player = await open(browser, phone ? SMALL_PHONE : DESKTOP, true);
  const page = await showResults(player);
  await expect(page.getByText('Gazeta idzie do druku.').first()).toBeAttached();
  await expectSummary(page, phone ? 'page' : 'column');
  if (phone) {
    await expect(page.getByText('Podsumowanie', { exact: true })).toBeVisible();
    await expect(page.getByText(/^1 z 7$/)).toBeVisible();
    // At 640×360 the six rows and the total are on screen without scrolling the page.
    const totalShown = await page.getByTestId('results-totals').evaluate((table) => {
      let box = table.parentElement;
      while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) {
        box = box.parentElement;
      }
      const foot = table.querySelector('tfoot');
      return box && foot
        ? foot.getBoundingClientRect().bottom <= box.getBoundingClientRect().bottom + 0.5
        : false;
    });
    expect(totalShown).toBe(true);
  } else {
    await expect(page.getByText('Skąd te progi?')).toBeVisible();
    await expect(page.getByText(/dwie gwiazdki od 50%, trzy od 79%/)).toBeVisible();
    // Keyboard and gamepad cannot scroll the column: at 1366×768 it fits without scrolling.
    const fits = await page.getByTestId('results-summary-column').evaluate((node) => {
      const column = node.parentElement;
      return column ? column.scrollHeight <= column.clientHeight : false;
    });
    expect(fits).toBe(true);
  }
  await page.screenshot({
    path: testInfo.outputPath('results-summary.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
  if (phone) {
    // The next page is the first folder's card.
    await page.getByRole('button', { name: 'Następna teczka' }).click();
    await expect(page.getByText(/^2 z 7$/)).toBeVisible();
    await expect(page.getByTestId('results-summary-page')).toHaveCount(0);
  }
});

// Any key finishes the reveal: the panel switches to „instant” (only a skip does that with
// motion on) and every row is there at once. The key goes in from inside the page as soon as
// the reveal runs, so a slow test machine cannot let the reveal end first.
test('any key finishes the reveal', async ({ browser }, testInfo) => {
  const phone = testInfo.project.name !== 'desktop';
  const player = await open(browser, phone ? SMALL_PHONE : DESKTOP, false);
  const { page } = player;
  await createRoom(player);
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  const before = await page.evaluate(async (levelEnd) => {
    (window as unknown as { __game: Hook }).__game.setState({ levelEnd });
    const panel = await new Promise<Element>((resolve) => {
      const poll = () => {
        const found = document.querySelector('[data-testid="results"][data-reveal="running"]');
        if (found) {
          resolve(found);
        } else {
          requestAnimationFrame(poll);
        }
      };
      poll();
    });
    // The keydown listener is attached in an effect, after the first paint.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const state = panel.getAttribute('data-reveal');
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX', key: 'x' }));
    return state;
  }, LEVEL_END);
  expect(before).toBe('running');
  const panel = page.getByTestId('results');
  await expect(panel).toHaveAttribute('data-reveal', 'instant');
  const totals = page.getByTestId('results-totals');
  await expect(totals.locator('tr[data-row="unfinished"]')).toBeVisible();
  await expectSummary(page, phone ? 'page' : 'column');
  await page.screenshot({
    path: testInfo.outputPath('results-finished.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});

// Endless has no stars: the summary is the run's figures and the same totals table.
test('endless results show the totals without stars', async ({ browser }, testInfo) => {
  const phone = testInfo.project.name !== 'desktop';
  const player = await open(browser, phone ? SMALL_PHONE : DESKTOP, true);
  const page = await showResults(player, {
    ...LEVEL_END,
    levelId: 'endless',
    won: false,
    stars: 0,
    credibility: 0,
    lossReason: 'credibility',
    starThresholds: null,
    maxScore: null,
    survivedS: 200,
  });
  const summary = page.getByTestId(`results-summary-${phone ? 'page' : 'column'}`);
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('results-progress')).toHaveCount(0);
  await expect(summary.getByText('wynik ponad 0')).toHaveCount(0);
  await expect(page.getByTestId('results-totals').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('endless-survived')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('results-endless.png'),
    scale: 'css',
    style: HIDE_PERF,
  });
});
