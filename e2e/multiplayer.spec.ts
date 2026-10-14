import { expect, type Page, test } from '@playwright/test';
import {
  avatarPositions,
  closePlayers,
  createRoom,
  DESKTOP,
  GAME_READY_TIMEOUT_MS,
  hideScene,
  joinRoom,
  moveRightUntil,
  openPlayer,
  PHONE,
  pickRole,
  rosterRow,
  setReady,
} from './helpers.ts';

test.afterEach(closePlayers);

type RunLine = { folders: number; maxScore: number; stars: { two: number; three: number } | null };
type RoomStateFrame = { type: 'roomState'; phase: string; difficulty: string; run: RunLine | null };

/** Every `roomState` the page receives from the game server, oldest first. */
function recordRoomStates(page: Page): RoomStateFrame[] {
  const seen: RoomStateFrame[] = [];
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') {
        return;
      }
      const message = JSON.parse(payload) as { type?: string };
      if (message.type === 'roomState') {
        seen.push(message as RoomStateFrame);
      }
    });
  });
  return seen;
}

type BriefingRunText = Record<'difficulty' | 'folders' | 'two' | 'three' | 'rule', string>;

/**
 * Keeps what the briefing's run line says the moment it renders: the e2e server's briefing lasts
 * only 1.5 s, so polling for it later could miss it.
 */
async function recordBriefingRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __briefingRun?: unknown };
    const read = (id: string, attribute?: string) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return (attribute ? element?.getAttribute(attribute) : element?.textContent) ?? '';
    };
    const observer = new MutationObserver(() => {
      if (document.querySelector('[data-testid="briefing-run"]')) {
        store.__briefingRun = {
          difficulty: read('briefing-difficulty'),
          folders: read('briefing-folders'),
          two: read('briefing-stars-2', 'aria-label'),
          three: read('briefing-stars-3', 'aria-label'),
          rule: read('briefing-rule'),
        };
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function briefingRunText(page: Page): Promise<BriefingRunText | null> {
  return page.evaluate(
    () => ((window as unknown as { __briefingRun?: unknown }).__briefingRun ?? null) as never,
  );
}

test('players create and join a room, start, and see each other move', async ({
  browser,
}, testInfo) => {
  // Three tabs of software WebGL: about 25 s on an idle machine, two minutes at load 40.
  test.slow();
  const options = testInfo.project.name === 'mobile' ? PHONE : DESKTOP;
  const host = await openPlayer(browser, 'Zośka', options);
  const guests = [
    await openPlayer(browser, 'Łukasz', options),
    await openPlayer(browser, 'Ola', options),
  ];

  const code = await createRoom(host);
  for (const guest of guests) {
    await joinRoom(guest, code);
  }
  await expect(host.page.getByText('3 z 4 przy biurkach')).toBeVisible();

  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of [host, ...guests]) {
    await expect(player.page.getByTestId('hud')).toBeVisible({ timeout: GAME_READY_TIMEOUT_MS });
  }

  // Everyone renders all three avatars.
  const watcher = guests[1];
  if (!watcher) {
    throw new Error('missing guest');
  }
  await expect
    .poll(async () => Object.keys(await avatarPositions(watcher)).sort())
    .toEqual(['Ola', 'Zośka', 'Łukasz']);
  const before = (await avatarPositions(watcher)).Zośka?.x ?? 0;

  // Held until both guests see the host move: the host's tab samples the key once per frame.
  await moveRightUntil(host, async () => {
    await expect
      .poll(async () => (await avatarPositions(watcher)).Zośka?.x ?? 0)
      .toBeGreaterThan(before + 1);
    await expect
      .poll(async () => (await avatarPositions(guests[0] ?? host)).Zośka?.x ?? 0)
      .toBeGreaterThan(before + 1);
  });
});

test('a mixed room: desktop host and phone guest see each other', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'covers both device types in one run');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const phone = await openPlayer(browser, 'Łukasz', PHONE);
  const code = await createRoom(host);
  await joinRoom(phone, code);
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(phone.page.getByTestId('touch-controls')).toBeVisible();
  await expect(host.page.getByTestId('touch-controls')).toBeHidden();

  await expect.poll(async () => Object.keys(await avatarPositions(host)).length).toBe(2);
  const before = (await avatarPositions(host)).Łukasz?.x ?? 0;
  await moveRightUntil(phone, () =>
    expect
      .poll(async () => (await avatarPositions(host)).Łukasz?.x ?? 0)
      .toBeGreaterThan(before + 1),
  );
});

test('the host starts only when guests are ready, and roles show on every roster', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'covers both device types in one run');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const phone = await openPlayer(browser, 'Łukasz', PHONE);
  const code = await createRoom(host);
  await joinRoom(phone, code, { ready: false });

  const start = host.page.getByRole('button', { name: 'Do składu!' });
  await expect(start).toBeDisabled();
  await expect(host.page.getByTestId('start-reason')).toHaveText('Czekamy na: Łukasz.');
  await expect(host.page.getByTestId('level-card')).toContainText('Makieta');
  await expect(phone.page.getByTestId('level-card')).toContainText('Makieta');

  await pickRole(phone, 'Archiwista');
  await expect(rosterRow(host, 'Łukasz').getByTestId('roster-role')).toHaveText('Archiwista');
  await pickRole(host, 'Redaktor prowadzący');
  await expect(rosterRow(phone, 'Zośka').getByTestId('roster-role')).toHaveText(
    'Redaktor prowadzący',
  );

  await setReady(phone, true);
  await expect(start).toBeEnabled();
  await setReady(phone, false);
  await expect(start).toBeDisabled();
  await setReady(phone, true);
  await start.click();
  for (const player of [host, phone]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
  }
});

test('leaving frees the slot and returns to the front page', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'device-independent');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const guest = await openPlayer(browser, 'Łukasz', DESKTOP);
  const code = await createRoom(host);
  await joinRoom(guest, code);
  await expect(host.page.getByText('2 z 4 przy biurkach')).toBeVisible();
  await guest.page.getByRole('button', { name: 'Wyjdź' }).click();
  await expect(
    guest.page.getByRole('heading', { name: 'Redakcja na Ostatnią Chwilę' }),
  ).toBeVisible();
  await expect(host.page.getByText('1 z 4 przy biurkach')).toBeVisible();
});

test('leaving mid-level goes through the menu, which keeps a shared level running', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'device-independent');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const guest = await openPlayer(browser, 'Łukasz', DESKTOP);
  // Both have seen the tutorial, so Esc goes straight to the menu.
  for (const player of [host, guest]) {
    await player.page.evaluate(() => localStorage.setItem('redakcja.tutorial.done', '1'));
  }
  const code = await createRoom(host);
  await joinRoom(guest, code);
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of [host, guest]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
  }
  await expect.poll(async () => Object.keys(await avatarPositions(guest)).length).toBe(2);

  const elapsed = () =>
    host.page.evaluate(
      () =>
        (window as unknown as { __game: { getState(): { elapsedMs: number } } }).__game.getState()
          .elapsedMs,
    );
  await host.page.keyboard.press('Escape');
  const menu = host.page.getByTestId('game-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByTestId('game-menu-status')).toHaveText('Gra trwa dalej');
  const openedAt = await elapsed();
  await expect.poll(elapsed).toBeGreaterThan(openedAt + 500);

  // Software WebGL is slow; the two presses must land within 3 s and need no scene.
  await hideScene(host.page);
  const leave = menu.getByTestId('game-menu-leave');
  await leave.click();
  await expect(leave).toHaveText('Na pewno? Wyjdź');
  // Confirmed from the keyboard: a click's actionability checks can outlast the 3 s window here.
  await leave.press('Enter');
  await expect(
    host.page.getByRole('heading', { name: 'Redakcja na Ostatnią Chwilę' }),
  ).toBeVisible();
  await expect.poll(async () => Object.keys(await avatarPositions(guest))).toEqual(['Łukasz']);
});

test('joining an unknown room shows a Polish error', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'device-independent');
  const player = await openPlayer(browser, 'Ala', DESKTOP);
  await player.page.getByLabel('Kod pokoju').fill('ZZZZ');
  await player.page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(player.page.getByRole('alert')).toHaveText('Nie ma redakcji z takim kodem.');
});

test('the host picks Trudny, the guest sees it, and the briefing shows the dealt run', async ({
  browser,
}, testInfo) => {
  // Three tabs of software WebGL: about 25 s on an idle machine, two minutes at load 40.
  test.slow();
  const options = testInfo.project.name === 'mobile' ? PHONE : DESKTOP;
  const host = await openPlayer(browser, 'Zośka', options);
  const guest = await openPlayer(browser, 'Łukasz', options);
  const hostFrames = recordRoomStates(host.page);
  const code = await createRoom(host);
  await joinRoom(guest, code);
  const lobbyFolders = async () =>
    Number.parseInt((await guest.page.getByTestId('level-folders').textContent()) ?? '', 10);
  await expect(guest.page.getByTestId('difficulty-chip')).toHaveText('Poziom: Normalny');
  const normalFolders = await lobbyFolders();

  const hard = host.page.getByRole('radio', { name: 'Trudny' });
  if (options === DESKTOP) {
    // Keyboard (and the pad, through the same menu intents): right from Normalny, then confirm.
    await host.page.getByRole('radio', { name: 'Normalny' }).focus();
    await host.page.keyboard.press('ArrowRight');
    await expect(hard).toBeFocused();
    await host.page.keyboard.press('Enter');
  } else {
    await host.page.locator('label').filter({ has: hard }).click();
  }
  await expect(hard).toBeChecked();
  await expect(guest.page.getByTestId('difficulty-chip')).toHaveText('Poziom: Trudny');
  // Trudny packs the bag's slots tighter: the guest's level card counts more folders at once.
  await expect.poll(lobbyFolders).toBeGreaterThan(normalFolders);
  const hardFolders = await lobbyFolders();

  // A new difficulty resets ready, so the guest signs again before the host can start.
  const start = host.page.getByRole('button', { name: 'Do składu!' });
  await expect(start).toBeDisabled();
  await setReady(guest, true);
  for (const player of [host, guest]) {
    await recordBriefingRun(player.page);
  }
  await start.click();
  // The briefing has rendered its run line for both (the level itself is covered above).
  for (const player of [host, guest]) {
    await expect.poll(() => briefingRunText(player.page)).not.toBeNull();
  }

  const dealt = hostFrames.find((frame) => frame.phase === 'briefing' && frame.run !== null);
  const run = dealt?.run;
  const stars = run?.stars;
  if (!dealt || !run || !stars) {
    throw new Error('no dealt run in the briefing');
  }
  expect(dealt.difficulty).toBe('hard');
  // The lobby named the very count the run dealt.
  expect(run.folders).toBe(hardFolders);
  for (const player of [host, guest]) {
    const shown = await briefingRunText(player.page);
    expect(shown?.difficulty).toBe('Trudny');
    expect(shown?.folders).toMatch(new RegExp(`^${run.folders} tecz`));
    expect(shown?.two).toBe(`2 gwiazdki od ${stars.two}\u00a0pkt`);
    expect(shown?.three).toBe(`3 gwiazdki od ${stars.three}\u00a0pkt`);
    expect(shown?.rule).toContain(`${run.maxScore}\u00a0pkt`);
    expect(shown?.rule).toContain(`${Math.round((stars.two / run.maxScore) * 100)}\u00a0%`);
  }
});
