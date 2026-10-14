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
// middle of a match sees both newsrooms within a second of the sync. The players render small
// (software GL would crawl with four big canvases); only the spectator's page is full size, and
// it asks for the high preset so the spectator cap (medium, no shadows) is what gets measured.

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
    // Mouse: the plate focuses its newsroom, a second press brings both back.
    await watcher.page.getByTestId('spectate-plate-0').click();
    await expect(views).toHaveCount(2);
    await watcher.page.getByTestId('spectate-plate-1').click();
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
  // One tap on Głos's score switches the view; the canvas stays the same one.
  await watcher.page.getByTestId('spectate-score-1').tap();
  await expect(views.first()).toHaveAttribute('data-team', '1');
  await expect(views.first()).toHaveAttribute('data-live', 'true');
  await expect(canvases).toHaveCount(1);
  await expect(watcher.page.getByTestId('spectate-plate-1')).toContainText('Łukasz');
  await expect(watcher.page.getByTestId('spectate-score-1')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await watcher.page.getByTestId('spectate-score-0').tap();
  await expect(views.first()).toHaveAttribute('data-team', '0');
});
