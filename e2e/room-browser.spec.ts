// S7-88: the room browser. The e2e server runs with `features.roomBrowser` on
// (e2e/server-config.json). A host opens a room, names it „3B piątek” and makes it public; until
// the lobby UI for both lands (S7-86) the spec sends the host's lobby actions over the page's own
// WebSocket, exactly as the lobby will. A guest who has not signed yet opens „Publiczne pokoje”,
// finds the room by „3b”, signs in the dialog and joins. Desktop at 1366×768 (keyboard) and a
// touch phone at 640×360 (filters behind „Filtry”).
import { expect, type Page, test, type WebSocketRoute } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

const ROOM_NAME = '3B piątek';

test('a public room is found by „3b” and joined', async ({ browser }, testInfo) => {
  test.slow();
  const touch = testInfo.project.name !== 'desktop';
  const options = touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP;

  // The host: a room named „3B piątek”, made public over the page's own socket.
  const hostContext = await browser.newContext(DESKTOP);
  trackContext(hostContext);
  const host = await hostContext.newPage();
  host.on('pageerror', (error) => {
    throw error;
  });
  const sockets: WebSocketRoute[] = [];
  await host.routeWebSocket(/\/ws/, (ws) => {
    sockets.push(ws.connectToServer());
  });
  await host.goto('/');
  await host.getByLabel('Twój podpis').fill('Ewa');
  const code = await createRoom({ page: host, nickname: 'Ewa', touch: false });
  const server = sockets.at(-1);
  expect(server).toBeDefined();
  for (const action of [
    { kind: 'setRoomName', name: ROOM_NAME },
    { kind: 'setVisibility', visibility: 'public' },
  ]) {
    server?.send(JSON.stringify({ type: 'lobby', action }));
  }

  // The guest: no nickname yet.
  const guestContext = await browser.newContext(options);
  trackContext(guestContext);
  const guest = await guestContext.newPage();
  guest.on('pageerror', (error) => {
    throw error;
  });
  await guest.goto('/');
  const entry = guest.getByTestId('open-room-browser');
  await expect(entry).toBeVisible();
  await expect(guest.getByTestId('menu-watch-code')).toBeVisible();
  await tap(guest, touch, entry);

  const dialog = guest.getByTestId('room-browser');
  await expect(dialog).toBeVisible();
  // Nothing picked yet: the yellow „Dołącz” waits for a room.
  await expect(dialog.getByTestId('room-join')).toBeDisabled();

  // Filters: shown on desktop, behind „Filtry” on the phone. „Na punkty” has no room to offer.
  const filters = dialog.getByTestId('room-filters');
  if (touch) {
    await expect(filters).toBeHidden();
    await tap(guest, touch, dialog.getByTestId('room-filters-toggle'));
  }
  await expect(filters).toBeVisible();
  await tap(guest, touch, dialog.getByTestId('room-filter-mode-versus'));
  await expect(dialog.getByTestId('room-filters-toggle')).toContainText(touch ? 'Filtry (1)' : '');
  await expect(dialog.getByTestId('room-list-empty')).toContainText('Nic tu nie pasuje');
  await tap(guest, touch, dialog.getByTestId('room-filter-mode-any'));
  if (touch) {
    await tap(guest, touch, dialog.getByTestId('room-filters-toggle'));
    await expect(filters).toBeHidden();
  }

  // The search folds case and Polish letters: „3b” finds „3B piątek”. The server caches the
  // list for 2 s and the dialog asks every 8 s, so the new room may take one poll to show.
  await dialog.getByTestId('room-search').fill('3b');
  const row = dialog.getByTestId(`room-row-${code}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText(ROOM_NAME);
  await expect(row).toContainText('Gospodarz: Ewa');
  await expect(row).toContainText('Razem');
  await expect(row).toContainText('Normalny');
  await expect(row).toContainText('1/4');
  await expect(row).toHaveAttribute('data-can-join', 'true');
  // A search that matches nothing else keeps the list to this room.
  await expect(dialog.getByRole('radio')).toHaveCount(1);

  if (touch) {
    await row.tap();
  } else {
    // Keyboard: focus the row's radio, Space picks it.
    await row.locator('input[type="radio"]').focus();
    await guest.keyboard.press('Space');
  }
  await expect(dialog.getByRole('radio', { name: ROOM_NAME })).toBeChecked();
  // The Widownia is closed by default: no „Oglądaj”.
  await expect(dialog.getByTestId('room-watch')).toHaveCount(0);
  await expect(dialog.getByTestId('room-join')).toBeEnabled();
  await guest.screenshot({ path: testInfo.outputPath('room-browser.png'), scale: 'css' });

  // No nickname yet: „Dołącz” asks for one in the dialog, then joins.
  await tap(guest, touch, dialog.getByTestId('room-join'));
  await expect(dialog.getByTestId('room-browser-error')).toContainText('Najpierw wpisz podpis.');
  await dialog.getByTestId('room-browser-nickname').fill('Olek');
  if (touch) {
    await dialog.getByTestId('room-join').tap();
  } else {
    await dialog.getByTestId('room-join').focus();
    await guest.keyboard.press('Enter');
  }

  await expect(guest.getByTestId('room-code')).toHaveText(code);
  await expect(dialog).toBeHidden();
  await expect(host.getByText('Olek')).toBeVisible();
});

test('the dialog closes with Esc and stops asking for rooms', async ({ browser }, testInfo) => {
  const touch = testInfo.project.name !== 'desktop';
  const context = await browser.newContext(
    touch ? { ...PHONE, viewport: { width: 640, height: 360 } } : DESKTOP,
  );
  trackContext(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  let requests = 0;
  await page.route('**/api/rooms*', (route) => {
    requests += 1;
    return route.fulfill({ status: 503, json: { error: 'down' } });
  });
  await page.goto('/');
  await tap(page, touch, page.getByTestId('open-room-browser'));
  const dialog = page.getByTestId('room-browser');
  // A failed request: the error state with a retry.
  await expect(dialog.getByTestId('room-list-error')).toContainText('Nie udało się pobrać listy.');
  await tap(page, touch, dialog.getByTestId('room-list-retry'));
  await expect.poll(() => requests).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath('room-browser-error.png'), scale: 'css' });

  if (touch) {
    await tap(page, touch, dialog.getByTestId('room-browser-close'));
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(dialog).toBeHidden();
  const after = requests;
  await page.waitForTimeout(9000);
  expect(requests).toBe(after);
});

async function tap(
  page: Page,
  touch: boolean,
  target: ReturnType<Page['getByTestId']>,
): Promise<void> {
  if (touch) {
    await target.tap();
  } else {
    await target.click();
  }
  void page;
}
