import { expect, test } from '@playwright/test';
import {
  avatarPositions,
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  moveRight,
  openPlayer,
  PHONE,
  pickRole,
  rosterRow,
  setReady,
} from './helpers.ts';

test.afterEach(closePlayers);

test('players create and join a room, start, and see each other move', async ({
  browser,
}, testInfo) => {
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
    await expect(player.page.getByTestId('hud')).toBeVisible();
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

  await moveRight(host, 600);

  await expect
    .poll(async () => (await avatarPositions(watcher)).Zośka?.x ?? 0)
    .toBeGreaterThan(before + 1);
  await expect
    .poll(async () => (await avatarPositions(guests[0] ?? host)).Zośka?.x ?? 0)
    .toBeGreaterThan(before + 1);
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
  await moveRight(phone, 600);
  await expect
    .poll(async () => (await avatarPositions(host)).Łukasz?.x ?? 0)
    .toBeGreaterThan(before + 1);
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

test('joining an unknown room shows a Polish error', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'device-independent');
  const player = await openPlayer(browser, 'Ala', DESKTOP);
  await player.page.getByLabel('Kod pokoju').fill('ZZZZ');
  await player.page.getByRole('button', { name: 'Dołącz' }).click();
  await expect(player.page.getByRole('alert')).toHaveText('Nie ma redakcji z takim kodem.');
});
