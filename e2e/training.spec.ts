// Training (l0 Makieta) on the station bag (S7-27): two tabs play the dealt run and the first-game
// tutorial still advances on what the player really does, whatever story the bag deals first.
import { expect, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  moveRight,
  openPlayer,
  PHONE,
  type Player,
} from './helpers.ts';

test.afterEach(closePlayers);

/** Story ids of the folders this tab has, in the order the server sent them. */
function folderStories(player: Player): Promise<string[]> {
  return player.page.evaluate(() => {
    const game = (
      window as unknown as {
        __game?: { getState(): { folders: { storyId: string }[] } };
      }
    ).__game;
    return (game?.getState().folders ?? []).map((folder) => folder.storyId);
  });
}

test('Training deals bag folders to both tabs and the tutorial advances', async ({
  browser,
}, testInfo) => {
  const options = testInfo.project.name === 'desktop' ? DESKTOP : PHONE;
  const host = await openPlayer(browser, 'Zośka', options);
  const guest = await openPlayer(browser, 'Łukasz', options);

  const code = await createRoom(host);
  await joinRoom(guest, code);
  await expect(host.page.getByTestId('level-card')).toContainText('Makieta');
  await host.page.getByRole('button', { name: 'Do składu!' }).click();

  for (const player of [host, guest]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
    await expect(player.page.getByTestId('tutorial')).toHaveAttribute('data-step', 'move');
  }

  await moveRight(host, 600);
  await expect(host.page.getByTestId('tutorial')).toHaveAttribute('data-step', 'pickup');
  await expect(guest.page.getByTestId('tutorial')).toHaveAttribute('data-step', 'move');

  // The first slot is at 3 s; both tabs get the same dealt l0 stories.
  await expect
    .poll(async () => (await folderStories(host)).length, { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [first] = await folderStories(host);
  expect(first).toMatch(/^l0-/);
  await expect.poll(async () => (await folderStories(guest))[0]).toBe(first);
});
