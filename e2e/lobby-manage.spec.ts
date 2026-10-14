// S7-87: the host's manage sheet and the level details. The host hands the host role to a guest,
// the new host kicks a classmate after the confirm step (the kicked player lands on the menu with
// the reason), and a guest reads „Szczegóły” of the level. The sheets work by touch at 640×360
// (phone-small), by keyboard (desktop) and by gamepad (desktop, a 640×360 window). Screenshots of
// both sheets go to the test output for the design-rules §10 review.
import { type BrowserContextOptions, expect, type Page, test } from '@playwright/test';
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

test.afterEach(closePlayers);

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };
const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

function optionsFor(project: string): BrowserContextOptions {
  if (project === 'desktop') {
    return DESKTOP;
  }
  return project === 'phone-small' ? SMALL_PHONE : PHONE;
}

/** The host's „more” button on a member's card (or Widownia chip). */
function moreFor(viewer: Player, nickname: string) {
  return viewer.page.getByRole('button', { name: `Opcje: ${nickname}` });
}

async function press(player: Player, target: ReturnType<Page['getByTestId']>): Promise<void> {
  if (player.touch) {
    await target.tap();
  } else {
    await target.click();
  }
}

async function expectTouchTarget(target: ReturnType<Page['getByTestId']>): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeInViewport();
  const box = await target.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(48);
}

test('host hands the host on; the new host kicks a guest after confirming', async ({
  browser,
}, testInfo) => {
  const options = optionsFor(testInfo.project.name);
  const host = await openPlayer(browser, 'Zośka', options);
  const guest = await openPlayer(browser, 'Bartek', options);
  const third = await openPlayer(browser, 'Celina', DESKTOP);
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });
  await joinRoom(third, code, { ready: false });

  // Guests see no „more” buttons; the host sees one on every other card, not on its own.
  await expect(guest.page.getByTestId('member-options')).toHaveCount(0);
  await expect(host.page.getByTestId('member-options')).toHaveCount(2);
  await expect(moreFor(host, 'Zośka')).toHaveCount(0);

  const more = moreFor(host, 'Bartek');
  await expectTouchTarget(more);
  await host.page.addStyleTag({ content: HIDE_PERF });
  await host.page.screenshot({
    path: testInfo.outputPath(`lobby-host-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await press(host, more);
  const sheet = host.page.getByTestId('member-sheet');
  await expect(sheet.getByRole('heading', { name: 'Bartek' })).toBeVisible();
  for (const id of ['member-make-host', 'member-kick', 'member-sheet-close']) {
    await expectTouchTarget(sheet.getByTestId(id));
  }
  await host.page.screenshot({
    path: testInfo.outputPath(`member-sheet-${testInfo.project.name}.png`),
  });
  await press(host, sheet.getByTestId('member-make-host'));
  await expect(sheet).toBeHidden();

  // Bartek hosts now: the crown chip moved, and only he manages the others.
  for (const viewer of [host, guest, third]) {
    await expect(
      viewer.page.getByTestId('player-card').filter({ hasText: 'Bartek' }).getByTestId('host-chip'),
    ).toBeVisible();
  }
  await expect(host.page.getByTestId('member-options')).toHaveCount(0);
  await expect(guest.page.getByTestId('member-options')).toHaveCount(2);

  // The kick asks first; „Anuluj” goes back to the options.
  await press(guest, moreFor(guest, 'Celina'));
  const guestSheet = guest.page.getByTestId('member-sheet');
  await press(guest, guestSheet.getByTestId('member-kick'));
  await expect(guestSheet.getByText('Usunąć na pewno?')).toBeVisible();
  await expect(guestSheet.getByTestId('member-kick-cancel')).toBeFocused();
  await press(guest, guestSheet.getByTestId('member-kick-cancel'));
  await expect(guestSheet.getByTestId('member-make-host')).toBeVisible();
  await press(guest, guestSheet.getByTestId('member-kick'));
  await expectTouchTarget(guestSheet.getByTestId('member-kick-yes'));
  await press(guest, guestSheet.getByTestId('member-kick-yes'));
  await expect(guestSheet).toBeHidden();

  // Celina is back on the menu with the reason; the room goes on without her.
  await expect(third.page.getByRole('alert')).toHaveText('Gospodarz usunął cię z pokoju.');
  await expect(third.page.getByRole('button', { name: 'Otwórz pokój' })).toBeVisible();
  for (const viewer of [host, guest]) {
    await expect(viewer.page.getByTestId('player-card')).toHaveCount(2);
  }
  await expect(host.page.getByTestId('player-card').filter({ hasText: 'Celina' })).toHaveCount(0);
});

test('a guest reads the level details', async ({ browser }, testInfo) => {
  const options = optionsFor(testInfo.project.name);
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const guest = await openPlayer(browser, 'Bartek', options);
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });

  const open = guest.page.getByTestId('level-details-open');
  await expectTouchTarget(open);
  await press(guest, open);
  const details = guest.page.getByTestId('level-details');
  await expect(details.getByRole('heading', { level: 2 })).toBeVisible();
  // The training level: three stations with their purpose line, no events, stars as shares.
  const stations = details.getByTestId('level-details-stations');
  await expect(stations.getByRole('listitem')).toHaveCount(3);
  await expect(stations).toContainText('Lupa obrazu');
  await expect(stations).toContainText('Czy to zdjęcie krążyło już wcześniej?');
  await expect(details).toContainText('Bez niespodzianek. Same teczki.');
  await expect(details.getByTestId('level-details-stars')).toContainText('50% możliwych punktów');
  await expect(details.getByTestId('level-details-stars')).toContainText('80% możliwych punktów');
  await expect(details.getByTestId('level-details-folders')).toContainText('z puli 17 historii');
  await expect(details.getByTestId('level-details-best').getByRole('listitem')).toHaveCount(4);
  await guest.page.addStyleTag({ content: HIDE_PERF });
  await guest.page.screenshot({
    path: testInfo.outputPath(`level-details-${testInfo.project.name}.png`),
  });

  // Na punkty adds the rule line.
  await press(guest, details.getByTestId('level-details-close'));
  await expect(details).toBeHidden();
  await host.page.getByTestId('room-mode-versus').click();
  await expect(guest.page.getByTestId('room-mode-chip')).toHaveText('Na punkty');
  await press(guest, open);
  await expect(details.getByTestId('level-details-rule')).toHaveText(
    'Wygrywa redakcja z większą liczbą punktów.',
  );
  const close = details.getByTestId('level-details-close');
  await expectTouchTarget(close);
  await press(guest, close);
  await expect(details).toBeHidden();
});

test('the sheets by keyboard', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'keyboard');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const guest = await openPlayer(browser, 'Bartek', DESKTOP);
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });
  const page = host.page;

  await moreFor(host, 'Bartek').focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByTestId('member-sheet');
  await expect(sheet).toBeVisible();
  // Tab walks the sheet's buttons; Enter on „Usuń z pokoju” asks first; Esc closes.
  await sheet.getByTestId('member-kick').focus();
  await page.keyboard.press('Enter');
  await expect(sheet.getByTestId('member-kick-cancel')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByTestId('member-kick-yes')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId('player-card').filter({ hasText: 'Bartek' })).toHaveCount(1);

  await page.getByTestId('level-details-open').focus();
  await page.keyboard.press('Enter');
  const details = page.getByTestId('level-details');
  await expect(details).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
});

/** A fake standard gamepad; the test presses its buttons through `window.__pad`. */
function installFakePad(): void {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
  const pad = {
    id: 'e2e pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons,
  };
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad], configurable: true });
  (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad = {
    press(i, down) {
      const button = buttons[i];
      if (button) {
        button.pressed = down;
        button.value = down ? 1 : 0;
      }
    },
  };
}

/** Presses and releases one pad button (standard mapping: 0 A, 1 B, 12 up, 13 down). */
async function tapPad(page: Page, button: number): Promise<void> {
  for (const down of [true, false]) {
    await page.evaluate(
      ([index, isDown]) =>
        (window as unknown as { __pad: { press(i: number, down: boolean): void } }).__pad.press(
          index,
          isDown,
        ),
      [button, down] as const,
    );
    await page.waitForTimeout(120);
  }
}

test('the sheets by gamepad at 640×360', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gamepad');
  const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
  trackContext(context);
  await context.addInitScript(installFakePad);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/');
  await page.getByLabel('Twój podpis').fill('Zośka');
  const host: Player = { page, nickname: 'Zośka', touch: false };
  const guest = await openPlayer(browser, 'Bartek', DESKTOP);
  const code = await createRoom(host);
  await joinRoom(guest, code, { ready: false });

  // A on the focused „more” opens the sheet; the d-pad walks it; B closes it.
  await moreFor(host, 'Bartek').focus();
  await tapPad(page, 0);
  const sheet = page.getByTestId('member-sheet');
  await expect(sheet).toBeVisible();
  await sheet.getByTestId('member-make-host').focus();
  await tapPad(page, 13);
  await expect(sheet.getByTestId('member-kick')).toBeFocused();
  await tapPad(page, 0);
  await expect(sheet.getByTestId('member-kick-cancel')).toBeFocused();
  await tapPad(page, 0);
  await expect(sheet.getByTestId('member-kick')).toBeFocused();
  await tapPad(page, 1);
  await expect(sheet).toBeHidden();

  // The details (the host's button stays next to the tiles on a phone): down focuses the body
  // and then scrolls it; B closes.
  await expectTouchTarget(page.getByTestId('level-details-open'));
  await page.getByTestId('level-details-open').focus();
  await tapPad(page, 0);
  const details = page.getByTestId('level-details');
  await expect(details).toBeVisible();
  const body = details.getByTestId('level-details-body');
  await body.focus();
  await tapPad(page, 13);
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectTouchTarget(details.getByTestId('level-details-close'));
  await tapPad(page, 1);
  await expect(details).toBeHidden();
});
