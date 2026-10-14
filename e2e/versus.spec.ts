// S7-86: the lobby in Na punkty. The host names the room, switches the mode and opens the
// Widownia; a guest lands in the Głos column, moves between the newsrooms, watches from the
// Widownia and comes back; the start waits for a player in each newsroom. In the game, a late
// classmate who finds the match under way watches it, and the players get „Widz dołączył”. A
// 640×360 lobby screenshot goes to the test output for the design-rules §10 review.
import { type BrowserContextOptions, expect, type Page, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
  type Player,
  setReady,
} from './helpers.ts';

test.afterEach(closePlayers);

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };
const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

function column(player: Player, team: 0 | 1) {
  return player.page.getByTestId(`team-${team}`);
}

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('lobby: name, mode switch, newsroom columns, Widownia and the start', async ({
  browser,
}, testInfo) => {
  const options = testInfo.project.name === 'desktop' ? DESKTOP : PHONE;
  const host = await openPlayer(browser, 'Zośka', options);
  const guest = await openPlayer(browser, 'Bartek', options);
  const code = await createRoom(host);

  // Private by default; the e2e server offers the room browser, so the host may go public.
  await expect(host.page.getByTestId('room-visibility-private').locator('input')).toBeChecked();
  const name = host.page.getByTestId('room-name');
  await name.fill('3B piątek');
  await name.press('Enter');

  await joinRoom(guest, code, { ready: false });
  await expect(guest.page.getByTestId('room-title')).toHaveText('3B piątek');
  await expect(guest.page.getByTestId('room-mode-chip')).toHaveText('Razem');
  await expect(guest.page.getByTestId('room-mode')).toHaveCount(0);
  await expect(guest.page.getByTestId('room-visibility-chip')).toHaveText('Prywatny');
  await expect(guest.page.getByTestId('room-visibility')).toHaveCount(0);
  await host.page.getByTestId('room-visibility-public').click();
  await expect(guest.page.getByTestId('room-visibility-chip')).toHaveText('Publiczny');
  // Back to private, so the room stays out of other specs' room lists.
  await host.page.getByTestId('room-visibility-private').click();
  await expect(guest.page.getByTestId('room-visibility-chip')).toHaveText('Prywatny');

  // Na punkty: the players are dealt into Kurier and Głos in join order.
  await host.page.getByTestId('room-mode-versus').click();
  await expect(guest.page.getByTestId('room-mode-chip')).toHaveText('Na punkty');
  await expect(guest.page.getByTestId('room-mode-hint')).toHaveText(
    'Dwie redakcje, wygrywa więcej punktów',
  );
  for (const viewer of [host, guest]) {
    await expect(column(viewer, 0)).toContainText('Zośka');
    await expect(column(viewer, 1)).toContainText('Bartek');
  }
  await expect(column(host, 0)).toContainText('1 z 4');
  await setReady(guest, true);
  await expect(host.page.getByTestId('start-reason')).toHaveText('Wszyscy gotowi!');

  // „Przejdź tutaj” is in the free seat of the other newsroom only.
  await expect(guest.page.getByTestId('join-team-1')).toHaveCount(0);
  await guest.page.getByTestId('join-team-0').click();
  await expect(column(host, 0)).toContainText('Bartek');
  await expect(host.page.getByTestId('teams-uneven')).toBeVisible();
  await expect(host.page.getByTestId('start-reason')).toHaveText('Głos: brak graczy.');
  await expect(host.page.getByRole('button', { name: 'Do składu!' })).toBeDisabled();
  await guest.page.getByTestId('join-team-1').click();
  await expect(column(host, 1)).toContainText('Bartek');
  await expect(host.page.getByTestId('teams-uneven')).toHaveCount(0);

  // The Widownia is closed by default; the host opens it, the guest watches for a while.
  await expect(guest.page.getByTestId('spectators-state')).toContainText('Widownia zamknięta');
  await expect(guest.page.getByTestId('to-spectators')).toHaveCount(0);
  await host.page.getByTestId('spectators-allowed').locator('label').click();
  await expect(guest.page.getByTestId('spectators-state')).toContainText('Widownia otwarta');
  await guest.page.getByTestId('to-spectators').click();
  await expect(guest.page.getByTestId('spectator-waiting')).toHaveText(
    'Oglądasz. Gospodarz zaraz zaczyna.',
  );
  await expect(guest.page.getByTestId('role-pass-none')).toHaveCount(0);
  await expect(guest.page.getByRole('checkbox', { name: 'Gotowy' })).toHaveCount(0);
  await expect(host.page.getByTestId('spectator-chip')).toHaveText(/Bartek/);
  await expect(host.page.getByTestId('start-reason')).toHaveText('Głos: brak graczy.');

  // „Do gry” is the watching guest's yellow action; the kept newsroom takes them back.
  await guest.page.getByTestId('to-players').click();
  await expect(column(host, 1)).toContainText('Bartek');
  await setReady(guest, true);
  await host.page.addStyleTag({ content: HIDE_PERF });
  await host.page.screenshot({
    path: testInfo.outputPath(`lobby-versus-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of [host, guest]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
  }

  // A late classmate finds the match under way and watches it; the players are told.
  const late = await openPlayer(browser, 'Ola', options);
  await late.page.getByLabel('Kod pokoju').fill(code);
  await late.page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(late.page.getByRole('alert')).toHaveText(/Pojedynek trwa\. Możesz go oglądać\./);
  await late.page.getByTestId('menu-watch').click();
  // Both at once: the toast lives 3 s, too short to check one page after the other under load.
  await Promise.all(
    [host, guest].map((player) => expect(player.page.getByText('Widz dołączył')).toBeVisible()),
  );
});

test('lobby at 640×360: one row of settings, two columns and the sticky start', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one small-phone run is enough');
  const host = await openPlayer(browser, 'Zośka', SMALL_PHONE);
  const guest = await openPlayer(browser, 'Bartek', DESKTOP);
  const third = await openPlayer(browser, 'Celina', DESKTOP);
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });
  await host.page.getByTestId('room-mode-versus').click();
  await joinRoom(third, code, { ready: false });
  await host.page.getByTestId('spectators-allowed').locator('label').click();
  await third.page.getByTestId('to-spectators').click();
  await expect(host.page.getByTestId('spectator-chip')).toHaveText(/Celina/);
  await expect(column(host, 1)).toContainText('Bartek');

  await noSideScroll(host.page);
  // The footer with the one yellow action sticks to the bottom edge.
  const start = host.page.getByRole('button', { name: 'Do składu!' });
  await expect(start).toBeInViewport();
  const box = await start.boundingBox();
  expect((box?.height ?? 0) >= 48).toBe(true);

  await host.page.addStyleTag({ content: HIDE_PERF });
  await host.page.screenshot({ path: testInfo.outputPath('lobby-versus-640x360.png') });
  await host.page.screenshot({
    path: testInfo.outputPath('lobby-versus-640x360-full.png'),
    fullPage: true,
  });
});
