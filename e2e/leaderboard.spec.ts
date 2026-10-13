// S7-26: the lobby leaderboard dialog keeps one list per difficulty. It opens on the room's
// difficulty and its difficulty tabs fetch and show that difficulty's list (click, tap or keys).
import { expect, type Page, type Route, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, openPlayer, PHONE } from './helpers.ts';

test.afterEach(closePlayers);

/** One made-up crew per difficulty, so the shown list says which difficulty was fetched. */
const CREWS: Record<string, string> = {
  easy: 'Zuza',
  normal: 'Ola',
  hard: 'Kuba',
  expert: 'Adam',
};

/** Answers `/api/leaderboard` with one row named after the asked difficulty; logs each ask. */
async function fakeBoard(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route('**/api/leaderboard?*', (route: Route) => {
    const url = new URL(route.request().url());
    const difficulty = url.searchParams.get('difficulty') ?? 'missing';
    asked.push(`${url.searchParams.get('scope')}:${difficulty}`);
    return route.fulfill({
      json: {
        scope: url.searchParams.get('scope'),
        entries: [
          {
            roomCode: 'ABCD',
            players: [CREWS[difficulty] ?? 'Nikt'],
            score: 120,
            difficulty: difficulty in CREWS ? difficulty : 'normal',
            survivedS: 300,
            createdAt: 1_790_000_000_000,
          },
        ],
      },
    });
  });
  return asked;
}

test('leaderboard dialog switches difficulty tabs', async ({ browser }, testInfo) => {
  // Desktop at 1366×768; phones at the smallest supported landscape size.
  const options =
    testInfo.project.name === 'desktop'
      ? DESKTOP
      : { ...PHONE, viewport: { width: 640, height: 360 } };
  const host = await openPlayer(browser, 'Ala', options);
  const asked = await fakeBoard(host.page);
  await createRoom(host);
  // The room plays on Hard: the dialog opens on the Hard list.
  await host.page.getByTestId('difficulty-hard').click();
  // Wait for the server to confirm it: the blurb follows the room state.
  await expect(host.page.getByTestId('difficulty-picker')).toContainText('Mniej czasu');
  await host.page.getByRole('button', { name: 'Wyniki' }).click();
  const dialog = host.page.getByTestId('leaderboard-dialog');
  await expect(dialog).toBeVisible();
  const tab = (id: string) => dialog.getByTestId(`leaderboard-difficulty-${id}`);
  await expect(tab('hard')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('leaderboard-list')).toContainText('Kuba');
  expect(asked).toContain('room:hard');

  // Click (or tap) another difficulty: its own list comes in.
  await (options.hasTouch ? tab('easy').tap() : tab('easy').click());
  await expect(tab('easy')).toHaveAttribute('aria-pressed', 'true');
  await expect(tab('hard')).toHaveAttribute('aria-pressed', 'false');
  await expect(dialog.getByTestId('leaderboard-list')).toContainText('Zuza');
  expect(asked).toContain('room:easy');

  // Keyboard: focus Ekspert and press Enter; the scope switch keeps the difficulty.
  await tab('expert').focus();
  await host.page.keyboard.press('Enter');
  await expect(dialog.getByTestId('leaderboard-list')).toContainText('Adam');
  await dialog.getByRole('button', { name: 'Wszyscy' }).click();
  await expect(dialog.getByTestId('leaderboard-list')).toContainText('Adam');
  expect(asked).toContain('global:expert');

  // Every tab fits the dialog, also on a 640×360-class phone.
  const sheet = await dialog.boundingBox();
  const last = await tab('expert').boundingBox();
  expect(sheet && last && last.x + last.width <= sheet.x + sheet.width).toBe(true);

  // Reopening starts from the room's difficulty again.
  await dialog.getByRole('button', { name: 'Gotowe' }).click();
  await expect(dialog).toBeHidden();
  await host.page.getByRole('button', { name: 'Wyniki' }).click();
  await expect(tab('hard')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByTestId('leaderboard-list')).toContainText('Kuba');
});
