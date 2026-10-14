import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
  type Player,
  trackContext,
} from './helpers.ts';

// The spectate screen (S7-90): a co-op match is watched in one canvas; a versus match in two side
// by side on a desktop and in one with a team switch on a phone. A spectator who joins in the
// middle of a match sees both newsrooms within a second of the sync. S7-91: the spectator follows
// a player on every device, reads the event feed, and in versus never sees how a folder went
// while the other newsroom still has it (the embargo's masked row), only once both closed it.
// The players render small (software GL would crawl with four big canvases); only the
// spectator's page is full size, and it asks for the high preset so the spectator cap (medium,
// no shadows) is what gets measured.

/** Players only have to exist: a small, cheap page. */
const SMALL: BrowserContextOptions = { viewport: { width: 640, height: 360 } };

type Lobby = { send(action: Record<string, unknown>): Promise<void> };

/** A lobby action sent through the `?debug` session hook (the lobby UI for it is S7-86). */
function lobbyOf(page: Page): Lobby {
  return {
    send: (action) =>
      page.evaluate((a) => {
        (window as unknown as { __session: { lobby(a: unknown): void } }).__session.lobby(a);
      }, action),
  };
}

/** The spectator's page, on the high preset (capped to medium on the spectate screen). */
async function openWatcher(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript(() => {
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ quality: 'high' }));
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Widz');
  return { page, nickname: 'Widz', touch: options.hasTouch === true };
}

async function startMatch(host: Player, players: readonly Player[]): Promise<void> {
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of players) {
    await expect(player.page.getByTestId('hud')).toBeVisible({ timeout: 40_000 });
  }
}

/** The spectator's options for this project: a full desktop, a landscape phone or a small one. */
function watcherOptions(project: string): BrowserContextOptions {
  if (project === 'phone-small') {
    return { ...PHONE, viewport: { width: 640, height: 360 } };
  }
  return project === 'mobile' ? PHONE : DESKTOP;
}

async function drawCalls(page: Page): Promise<{ drawCalls: number; triangles: number }> {
  const text = (await page.getByTestId('perf-overlay').innerText()).replace(/\n/g, ' ');
  const value = (label: string) =>
    Number(new RegExp(`${label}\\s+(\\d+)`).exec(text)?.[1] ?? Number.NaN);
  return { drawCalls: value('draw calls'), triangles: value('triangles') };
}

type Hooks = {
  __session: { receive(message: unknown): void };
  __fx: { useApp: { getState(): { room: { players: { id: string; nickname: string }[] } } } };
};

/** Feeds the watcher a server message, as the spectator topic would deliver it. */
async function receive(page: Page, message: Record<string, unknown>): Promise<void> {
  await page.evaluate((m) => {
    (window as unknown as Hooks).__session.receive(m);
  }, message);
}

/** A player's id by nickname, from the watcher's room state. */
async function playerId(page: Page, nickname: string): Promise<string> {
  const id = await page.evaluate(
    (name) =>
      (window as unknown as Hooks).__fx.useApp
        .getState()
        .room.players.find((player) => player.nickname === name)?.id ?? '',
    nickname,
  );
  expect(id).not.toBe('');
  return id;
}

/** The result the embargo holds for a closed folder (a correct reject worth 25 points). */
function result(folderId: string, spawnKey: string, playerId: string) {
  return {
    folderId,
    spawnKey,
    storyId: 'l0-zalany-rynek',
    outcome: 'correct',
    reason: 'correctImportant',
    verdict: 'reject',
    scoreDelta: 25,
    credibilityDelta: 5,
    justifyingStampIds: [],
    requiredStamps: 1,
    bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
    missedStampIds: [],
    playerId,
  };
}

/**
 * Follows `nickname` the way the device does it (→ on a keyboard, a tap on the chip on a touch
 * screen), checks the blue ring and the FollowCard, then stops following (Esc / the card's ✗).
 */
async function followAndStop(watcher: Player, nickname: string, id: string): Promise<void> {
  const page = watcher.page;
  const chip = page.getByTestId(`spectate-player-${id}`);
  if (watcher.touch) {
    await chip.tap();
  } else {
    await page.keyboard.press('ArrowRight');
  }
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const card = page.getByTestId('follow-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-player', id);
  await expect(card).toContainText(nickname);
  // The followed player's name tag wears the blue ring too.
  await expect(page.locator('[data-testid="name-tag"][data-followed="true"]')).toHaveCount(1);
  if (watcher.touch) {
    await page.getByTestId('follow-stop').tap();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(card).toHaveCount(0);
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
}

test.afterEach(closePlayers);

test('co-op: the Widownia watches one newsroom in one canvas', async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const host = await openPlayer(browser, 'Zośka', SMALL);
  const watcher = await openWatcher(browser, watcherOptions(testInfo.project.name));
  const code = await createRoom(host);
  await lobbyOf(host.page).send({ kind: 'setSpectatorsAllowed', allowed: true });
  await joinRoom(watcher, code, { ready: false });
  await lobbyOf(watcher.page).send({ kind: 'setSpectator', spectator: true });
  await expect(host.page.getByRole('button', { name: 'Do składu!' })).toBeEnabled();

  await startMatch(host, [host]);
  const screen = watcher.page.getByTestId('spectate-screen');
  await expect(screen).toBeVisible({ timeout: 40_000 });
  await expect(screen).toHaveAttribute('data-layout', 'single');
  const views = watcher.page.getByTestId('spectate-view');
  await expect(views).toHaveCount(1);
  await expect(views.first()).toHaveAttribute('data-live', 'true');
  await expect(watcher.page.locator('[data-testid="spectate-view"] canvas')).toHaveCount(1);
  // The co-op scoreboard: the one newsroom, the clock and the folder counts.
  await expect(watcher.page.getByTestId('spectate-score-0')).toBeVisible();
  await expect(watcher.page.getByTestId('spectate-score-1')).toHaveCount(0);
  await expect(watcher.page.getByRole('timer')).toBeVisible();
  await expect(watcher.page.getByTestId('spectate-plate-0')).toContainText('Zośka');

  // S7-91: follow the one player, then stop.
  const zoska = await playerId(watcher.page, 'Zośka');
  await followAndStop(watcher, 'Zośka', zoska);

  // A verdict comes into the feed as its full row (co-op has no embargo).
  await receive(watcher.page, {
    type: 'spectatorEvent',
    tick: 90,
    team: 0,
    event: { kind: 'verdictResult', ...result('f1', 's1', zoska) },
  });
  const row = watcher.page.locator('[data-testid="feed-row"][data-folder="f1"]');
  await expect(row).toHaveAttribute('data-kind', 'verdict');
  await expect(row).toContainText('Zośka: trafny werdykt');
  await expect(row).toContainText('+25');

  // The stats sheet opens from its button and closes with its ✗.
  await watcher.page.getByTestId('spectate-stats-open').click();
  const sheet = watcher.page.getByTestId('spectate-stats');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId(`stats-row-${zoska}`)).toBeVisible();
  await watcher.page.getByTestId('spectate-stats-close').click();
  await expect(sheet).toBeHidden();

  // The level end (as the spectator topic delivers it) brings the spectator results in place of
  // the view: the edition's result, the newsroom's card, the player's figures and the read-only
  // Kolegium (no blunder vote), with no sideways scroll down to 640×360.
  await receive(watcher.page, {
    type: 'levelEnd',
    levelId: 'l0-greybox',
    won: true,
    stars: 1,
    score: 25,
    credibility: 55,
    results: [result('f1', 's1', zoska)],
    lossReason: null,
    starThresholds: { two: 120, three: 190 },
    maxScore: 240,
  });
  const results = watcher.page.getByTestId('spectator-results');
  await expect(results).toBeVisible();
  await expect(views).toHaveCount(0);
  // It opens on the result, also on a short phone screen.
  await expect(results.locator('#spectator-results-title')).toBeInViewport();
  await expect(results.getByTestId('spectator-team-0')).toContainText('25');
  await expect(results.getByTestId(`stats-row-${zoska}`)).toBeVisible();
  await expect(results.getByRole('button', { name: /Wpadka/ })).toHaveCount(0);
  expect(
    await watcher.page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  await watcher.page.screenshot({
    path: testInfo.outputPath('spectator-results.png'),
    scale: 'css',
  });

  await watcher.page.getByTestId('spectate-leave').click();
  await expect(watcher.page.getByRole('button', { name: 'Otwórz pokój' })).toBeVisible();
});

test('versus: a mid-match spectator sees both newsrooms and can switch them', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const mobile = testInfo.project.name !== 'desktop';
  const host = await openPlayer(browser, 'Zośka', SMALL);
  const guest = await openPlayer(browser, 'Łukasz', SMALL);
  const code = await createRoom(host);
  const lobby = lobbyOf(host.page);
  await lobby.send({ kind: 'setSpectatorsAllowed', allowed: true });
  await lobby.send({ kind: 'setMode', mode: 'versus' });
  await joinRoom(guest, code);
  await startMatch(host, [host, guest]);

  // Joining a running versus match as a player is refused; the menu offers to watch instead.
  const watcher = await openWatcher(browser, watcherOptions(testInfo.project.name));
  await watcher.page.getByLabel('Kod pokoju').fill(code);
  await watcher.page.getByRole('button', { name: 'Dołącz' }).click();
  await watcher.page.getByTestId('menu-watch').click();
  const screen = watcher.page.getByTestId('spectate-screen');
  await expect(screen).toBeVisible({ timeout: 40_000 });
  // Both newsrooms are live within a second of the sync.
  await expect(watcher.page.getByTestId('spectate-score-0')).toBeVisible();
  await expect(watcher.page.getByTestId('spectate-score-1')).toBeVisible();
  const views = watcher.page.getByTestId('spectate-view');
  const canvases = watcher.page.locator('[data-testid="spectate-view"] canvas');

  // S7-91: follow Kurier's player on this device, then stop.
  const zoska = await playerId(watcher.page, 'Zośka');
  const lukasz = await playerId(watcher.page, 'Łukasz');
  await followAndStop(watcher, 'Zośka', zoska);

  // The embargo: Głos closed s90 first. Until Kurier closes it too, the feed only says that Głos
  // gave a verdict; nothing on screen tells how it went or what it scored. (The server side of
  // the embargo is covered by the S7-81 registry tests; here the watcher gets its messages.)
  const ours = watcher.page.locator(
    '[data-testid="feed-row"][data-folder="f901"], [data-testid="feed-row"][data-folder="f902"]',
  );
  const secrets = /trafny|błędny|słaby dowód|fałszywka|pkt|\+25|Odrzu|Publikuj|kontekstem/;
  const nothingTold = async () => {
    for (const text of await ours.allInnerTexts()) {
      expect(text).not.toMatch(secrets);
    }
    // Nowhere else on the spectator's screen either (its scoreboard says „pkt” for the totals).
    expect(await screen.innerText()).not.toMatch(
      /trafny|błędny|słaby dowód|fałszywka|\+25|Odrzu|Publikuj|kontekstem/,
    );
    await expect(watcher.page.getByTestId('follow-card')).toHaveCount(0);
  };
  await receive(watcher.page, {
    type: 'spectatorEvent',
    tick: 120,
    team: 1,
    event: {
      kind: 'verdictMasked',
      playerId: lukasz,
      folderId: 'f901',
      spawnKey: 's90',
      closedBy: 'verdict',
    },
  });
  const glosRow = ours.and(watcher.page.locator('[data-team="1"]'));
  await expect(glosRow).toHaveAttribute('data-kind', 'masked');
  await expect(glosRow).toContainText('Głos: werdykt');
  await nothingTold();
  // The stats sheet counts the masked verdict as given, but there is no accuracy yet.
  await watcher.page.getByTestId('spectate-stats-open').click();
  const lukaszStats = watcher.page.getByTestId(`stats-row-${lukasz}`);
  await expect(lukaszStats).toHaveAttribute('data-verdicts', '1');
  await expect(lukaszStats.getByTestId('stats-pending')).toBeVisible();
  await expect(lukaszStats).not.toHaveAttribute('data-accuracy', /.+/);
  await watcher.page.getByTestId('spectate-stats-close').click();
  await expect(watcher.page.getByTestId('spectate-stats')).toBeHidden();

  // Kurier closes s90 as well: the server reveals both results and the full rows take over.
  await receive(watcher.page, {
    type: 'spectatorEvent',
    tick: 130,
    team: 0,
    event: {
      kind: 'verdictMasked',
      playerId: zoska,
      folderId: 'f902',
      spawnKey: 's90',
      closedBy: 'verdict',
    },
  });
  await expect(ours).toHaveCount(2);
  await nothingTold();
  for (const [team, folderId, id] of [
    [1, 'f901', lukasz],
    [0, 'f902', zoska],
  ] as const) {
    await receive(watcher.page, {
      type: 'spectatorEvent',
      tick: 131,
      team,
      event: { kind: 'verdictRevealed', result: result(folderId, 's90', id) },
    });
  }
  await expect(glosRow).toHaveAttribute('data-kind', 'verdict');
  await expect(glosRow).toContainText('Łukasz: trafny werdykt');
  await expect(glosRow).toContainText('+25');
  const kurierRow = ours.and(watcher.page.locator('[data-team="0"]'));
  await expect(kurierRow).toContainText('Zośka: trafny werdykt');
  await expect(ours.and(watcher.page.locator('[data-kind="masked"]'))).toHaveCount(0);

  if (!mobile) {
    await expect(screen).toHaveAttribute('data-layout', 'side');
    await expect(views).toHaveCount(2);
    for (const team of ['0', '1']) {
      await expect(views.and(watcher.page.locator(`[data-team="${team}"]`))).toHaveAttribute(
        'data-live',
        'true',
        { timeout: 1000 },
      );
    }
    await expect(canvases).toHaveCount(2);
    // Each newsroom's plate lists its own players only.
    await expect(watcher.page.getByTestId('spectate-plate-0')).toContainText('Zośka');
    await expect(watcher.page.getByTestId('spectate-plate-0')).not.toContainText('Łukasz');
    await expect(watcher.page.getByTestId('spectate-plate-1')).toContainText('Łukasz');

    // Render budget: the two spectator canvases together (docs/performance.md).
    await watcher.page.waitForTimeout(2500);
    const counters = await drawCalls(watcher.page);
    console.log('perf spectate split desktop', counters);
    expect(counters.drawCalls).toBeGreaterThan(5);
    expect(counters.drawCalls).toBeLessThanOrEqual(150);
    expect(counters.triangles).toBeLessThanOrEqual(100_000);

    // Keyboard: 2 shows Głos alone, Esc brings both back, Space cycles.
    await watcher.page.keyboard.press('Digit2');
    await expect(views).toHaveCount(1);
    await expect(views.first()).toHaveAttribute('data-team', '1');
    await watcher.page.keyboard.press('Escape');
    await expect(views).toHaveCount(2);
    await watcher.page.keyboard.press('Space');
    await expect(views).toHaveCount(1);
    await expect(views.first()).toHaveAttribute('data-team', '0');
    // Mouse: the plate's team button focuses its newsroom, a second press brings both back.
    await watcher.page.getByTestId('spectate-team-0').click();
    await expect(views).toHaveCount(2);
    await watcher.page.getByTestId('spectate-team-1').click();
    await expect(views).toHaveCount(1);
    await expect(views.first()).toHaveAttribute('data-team', '1');
    return;
  }

  // A phone always watches one newsroom, with both scores in the top bar.
  await expect(screen).toHaveAttribute('data-layout', 'single');
  await expect(views).toHaveCount(1);
  await expect(views.first()).toHaveAttribute('data-live', 'true', { timeout: 1000 });
  await expect(views.first()).toHaveAttribute('data-team', '0');
  await expect(canvases).toHaveCount(1);
  // Render budget: one spectator canvas on a phone (docs/performance.md).
  await watcher.page.waitForTimeout(2500);
  const counters = await drawCalls(watcher.page);
  console.log(`perf spectate single ${testInfo.project.name}`, counters);
  expect(counters.drawCalls).toBeGreaterThan(5);
  expect(counters.drawCalls).toBeLessThanOrEqual(100);
  expect(counters.triangles).toBeLessThanOrEqual(100_000);
  await expect(watcher.page.getByTestId('spectate-score-0')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // One tap on Głos's score switches the view; the canvas (and its WebGL context) stays the same
  // one, and Głos, already synced, is live at once.
  await canvases.first().evaluate((canvas) => {
    canvas.dataset.e2eMark = 'first';
  });
  await watcher.page.getByTestId('spectate-score-1').tap();
  await expect(views.first()).toHaveAttribute('data-team', '1');
  await expect(views.first()).toHaveAttribute('data-live', 'true', { timeout: 1000 });
  await expect(canvases).toHaveCount(1);
  await expect(canvases.first()).toHaveAttribute('data-e2e-mark', 'first');
  await expect(watcher.page.getByTestId('spectate-plate-1')).toContainText('Łukasz');
  await expect(watcher.page.getByTestId('spectate-score-1')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await watcher.page.getByTestId('spectate-score-0').tap();
  await expect(views.first()).toHaveAttribute('data-team', '0');
});
