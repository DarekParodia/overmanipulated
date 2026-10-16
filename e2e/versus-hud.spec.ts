// S7-89: versus for players. Each newsroom sees the rival chip (under the HUD pill on desktop, the
// pill's last segment on phones) and only its own players; the results show who won, why, both
// newsrooms' points and the rival's verdict on each folder, with no stars or progress. Desktop at
// 1366×768, phones at the project's viewport (640×360 in `phone-small`).
// The host switches the mode in the lobby (S7-86's „Na punkty”); e2e/versus.spec.ts covers the
// lobby itself.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type TestInfo,
  test,
} from '@playwright/test';
import {
  avatarPositions,
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  PHONE,
  type Player,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

type Session = { receive(message: unknown): void };
type Hook = { setState(state: Record<string, unknown>): void };

function device(testInfo: TestInfo): BrowserContextOptions {
  if (testInfo.project.name === 'desktop') {
    return DESKTOP;
  }
  const viewport = testInfo.project.use.viewport;
  return viewport ? { ...PHONE, viewport } : PHONE;
}

/** A player with the tutorial done and reduced motion (instant results reveal, still boxes). */
async function open(browser: Browser, nickname: string, testInfo: TestInfo): Promise<Player> {
  const options = device(testInfo);
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => {
    // Init scripts also run in opaque-origin frames (about:blank, sandboxed), where touching
    // localStorage throws; only the game's own document needs the settings.
    try {
      localStorage.setItem('redakcja.tutorial.done', '1');
      localStorage.setItem('redakcja.settings.v1', JSON.stringify({ reducedMotion: true }));
    } catch {
      // Not the game's document.
    }
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch: options.hasTouch === true };
}

/** Opens a room, switches it to versus („Na punkty”), lets the guests in and starts. */
async function startVersus(host: Player, guests: Player[]): Promise<void> {
  const code = await createRoom(host);
  await host.page.getByTestId('room-mode-versus').click();
  await expect(host.page.getByTestId('team-0')).toBeVisible();
  // Guests join into the smaller newsroom, so they alternate: Kurier, Głos, Kurier, …
  for (const guest of guests) {
    await joinRoom(guest, code);
  }
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  // Two or three pages load the game chunk and compile a scene at once: give it the time the
  // other multi-page specs give it on a loaded machine.
  for (const player of [host, ...guests]) {
    await expect(player.page.getByTestId('hud')).toBeVisible({ timeout: 30_000 });
  }
}

test('each newsroom sees the rival chip and only its own players', async ({
  browser,
}, testInfo) => {
  // Three players in two newsrooms render two scenes each way: slow on a loaded machine.
  test.slow();
  const host = await open(browser, 'Zośka', testInfo);
  const rival = await open(browser, 'Łukasz', testInfo);
  const mate = await open(browser, 'Ola', testInfo);
  await startVersus(host, [rival, mate]);

  // Zośka and Ola play for Kurier (team 0), Łukasz for Głos (team 1): each chip shows the other.
  for (const [player, rivalTeam, name] of [
    [host, '1', 'Głos'],
    [mate, '1', 'Głos'],
    [rival, '0', 'Kurier'],
  ] as const) {
    const chip = player.page.getByTestId('versus-chip');
    await expect(chip).toBeVisible();
    await expect(chip.locator('svg[data-team]')).toHaveAttribute('data-team', rivalTeam);
    await expect(chip).toHaveAttribute(
      'aria-label',
      new RegExp(`^Rywale – ${name}: 0\\spkt\\. Remis$`),
    );
    await expect(chip).toHaveAttribute('data-lead', 'tied');
    await expect(chip.getByTestId('versus-chip-score')).toHaveText('0');
  }

  await expect
    .poll(async () => Object.keys(await avatarPositions(host)).sort())
    .toEqual(['Ola', 'Zośka']);
  await expect
    .poll(async () => Object.keys(await avatarPositions(rival)).sort())
    .toEqual(['Łukasz']);

  const pill = await host.page.locator('[data-hud-pill]').boundingBox();
  const chip = await host.page.getByTestId('versus-chip').boundingBox();
  if (!pill || !chip) {
    throw new Error('pill or chip not laid out');
  }
  if (testInfo.project.name === 'desktop') {
    // Desktop: the chip hangs under the pill.
    expect(chip.y).toBeGreaterThanOrEqual(pill.y + pill.height);
  } else {
    // Phones: the chip is the pill's last segment, and the HUD band stays one thin row.
    expect(chip.y).toBeGreaterThanOrEqual(pill.y);
    expect(chip.y + chip.height).toBeLessThanOrEqual(pill.y + pill.height + 1);
    expect(chip.x + chip.width).toBeLessThanOrEqual(pill.x + pill.width + 1);
    // The band is published a frame after the chip mounts: wait for it, then check it.
    const hudBand = () =>
      host.page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? Number.parseFloat(main.style.getPropertyValue('--hud-band')) || 0 : 0;
      });
    await expect.poll(hudBand).toBeGreaterThan(0);
    expect(await hudBand()).toBeLessThanOrEqual(72);
  }
  await host.page.addStyleTag({ content: HIDE_PERF });
  await host.page.screenshot({ path: testInfo.outputPath('versus-hud.png'), scale: 'css' });
});

function result(
  folderId: string,
  spawnKey: string,
  storyId: string,
  outcome: string,
  reason: string,
  verdict: string | null,
  scoreDelta: number,
  credibilityDelta = 0,
) {
  return {
    folderId,
    spawnKey,
    storyId,
    outcome,
    reason,
    verdict,
    scoreDelta,
    credibilityDelta,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
  };
}

const OWN = [
  result(
    'f1',
    's0',
    'l0-zalany-rynek',
    'correct',
    'correctWithContext',
    'publishWithContext',
    20,
    5,
  ),
  result('f2', 's1', 'l0-nocny-autobus', 'correct', 'correctNormal', 'publish', 10),
  result(
    'f3',
    'e0.0',
    'l0-zalany-rynek',
    'correct',
    'correctWithContext',
    'publishWithContext',
    20,
    5,
  ),
  result('f4', 'e0.1', 'l0-zalany-rynek', 'expired', 'expired', null, -5, -5),
];
/** The rival's belt was full at the raid: no e0.1, an extra e0.2 we never got, other ids. */
const RIVAL = [
  result(
    'f1',
    's0',
    'l0-zalany-rynek',
    'correct',
    'correctWithContext',
    'publishWithContext',
    20,
    5,
  ),
  result('f2', 's1', 'l0-nocny-autobus', 'wrong', 'rejectedTrue', 'reject', -10, -10),
  result(
    'f4',
    'e0.2',
    'l0-zalany-rynek',
    'correct',
    'correctWithContext',
    'publishWithContext',
    20,
    5,
  ),
  result('f3', 'e0.0', 'l0-zalany-rynek', 'unfinished', 'unfinished', null, 0),
];

function levelEnd(team: number, winnerTeam: number | null, reason: string) {
  const own = { team, score: 45, credibility: 55, resolved: 3, expired: 1, connected: 1 };
  const rivalScore = winnerTeam === null ? 45 : winnerTeam === team ? 30 : 60;
  const rival = { ...own, team: 1 - team, score: rivalScore, credibility: 40, resolved: 2 };
  return {
    type: 'levelEnd',
    levelId: 'l0-greybox',
    difficulty: 'normal',
    won: winnerTeam === team,
    stars: 0,
    score: 45,
    credibility: 55,
    results: OWN,
    lossReason: winnerTeam !== null && winnerTeam !== team ? 'score' : null,
    starThresholds: { two: 120, three: 190 },
    maxScore: 240,
    team,
    versus: {
      winnerTeam,
      reason,
      teams: team === 0 ? [own, rival] : [rival, own],
      rivalResults: RIVAL,
    },
  };
}

test('versus results: win, lose and draw from each side, with no stars', async ({
  browser,
}, testInfo) => {
  test.slow();
  const phone = testInfo.project.name !== 'desktop';
  const host = await open(browser, 'Zośka', testInfo);
  const guest = await open(browser, 'Łukasz', testInfo);
  await startVersus(host, [guest]);
  const { page } = host;
  await page.addStyleTag({ content: HIDE_PERF });

  const cases = [
    { name: 'win', winner: 0, reason: 'score', headline: 'Wygrana!', lede: 'Zdobyliście' },
    { name: 'lose', winner: 1, reason: 'score', headline: 'Przegrana', lede: 'Rywale zdobyli' },
    { name: 'draw', winner: null, reason: 'draw', headline: 'Remis', lede: 'tyle samo' },
  ] as const;
  for (const match of cases) {
    // The level end goes through the real routing: team 0's message reaches team 0's player.
    await page.evaluate(() => {
      (window as unknown as { __game: Hook }).__game.setState({ levelEnd: null });
    });
    await page.evaluate(
      (message) => {
        (window as unknown as { __session: Session }).__session.receive(message);
      },
      levelEnd(0, match.winner, match.reason),
    );
    const results = page.getByTestId('results');
    await expect(results).toBeVisible();
    await expect(results).toHaveAttribute('data-versus', match.name);
    await expect(page.locator('#results-headline')).toHaveText(match.headline);
    await expect(page.getByTestId('versus-score-line')).toHaveAttribute(
      'aria-label',
      `Kurier 45 : ${match.winner === null ? 45 : match.winner === 0 ? 30 : 60} Głos`,
    );
    // No stars and no progress line in versus.
    await expect(page.getByTestId('results-progress')).toHaveCount(0);
    const summary = page.getByTestId(phone ? 'results-summary-page' : 'results-summary-column');
    await expect(summary).toBeVisible();
    // The reason line: the ribbon's lede on desktop, the summary page's on phones.
    await expect(
      phone ? summary : page.getByTestId('results').locator('header').first(),
    ).toContainText(match.lede);
    const own = summary.getByTestId('versus-team-own');
    const theirs = summary.getByTestId('versus-team-rival');
    await expect(own).toContainText('Kurier');
    await expect(own).toContainText('Wy');
    await expect(theirs).toContainText('Głos');
    await expect(theirs).toContainText('Rywale');
    await expect(own.getByRole('img', { name: 'Zwycięzcy' })).toHaveCount(
      match.winner === 0 ? 1 : 0,
    );
    await expect(theirs.getByRole('img', { name: 'Zwycięzcy' })).toHaveCount(
      match.winner === 1 ? 1 : 0,
    );
    await expect(summary.getByTestId('results-totals')).toContainText('Razem');
    await page.screenshot({ path: testInfo.outputPath(`versus-${match.name}.png`), scale: 'css' });
  }

  // The Kolegium pairs the rival's verdicts by spawn key: s1 judged the other way, e0.0 still in
  // play, e0.1 never reached the rival (its extra e0.2 has no card of ours).
  const rivalOf = (index: number) =>
    page
      .getByTestId('kolegium-card')
      .nth(phone ? 0 : index)
      .getByTestId('kolegium-rival');
  const expected = ['correct', 'wrong', 'unfinished', 'missing'];
  if (phone) {
    // One card per page after the summary page.
    for (const [index, outcome] of expected.entries()) {
      await page.getByRole('button', { name: 'Następna teczka' }).click();
      await expect(page.getByTestId('kolegium-card')).toHaveCount(1);
      await expect(rivalOf(index)).toHaveAttribute('data-rival', outcome);
    }
  } else {
    await expect(page.getByTestId('kolegium-card')).toHaveCount(4);
    for (const [index, outcome] of expected.entries()) {
      await expect(rivalOf(index)).toHaveAttribute('data-rival', outcome);
    }
  }
  await expect(page.getByTestId('kolegium-rival').last()).toHaveText('nie mieli');
  // The „Wy” / „Rywale” verdict row (on phones the last card's page).
  await page.getByTestId('kolegium-rival').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('versus-kolegium.png'), scale: 'css' });

  // A versus match records no campaign progress.
  const progress = await page.evaluate(() => localStorage.getItem('redakcja.progress.v2'));
  expect(progress === null || !progress.includes('l0-greybox')).toBe(true);
});
