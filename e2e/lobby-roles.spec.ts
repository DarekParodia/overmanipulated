// S7-44: the lobby role picker. Seven passes (six roles and „Bez roli”) in one row on desktop,
// four compact row passes on a 640×360 phone, teammate marks on the passes they picked, and the
// detail panel with the passive, the ability with the device's key and its cooldown, and a note
// when the role's perk does nothing on the chosen level. Screenshots go to the test output for
// the design-rules §10 review.
import { type BrowserContextOptions, expect, type Page, test } from '@playwright/test';
import {
  closePlayers,
  createRoom,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
  pickRole,
  rosterRow,
} from './helpers.ts';

test.afterEach(closePlayers);

const SMALL_PHONE: BrowserContextOptions = { ...PHONE, viewport: { width: 640, height: 360 } };
const HIDE_PERF = '[data-testid="perf-overlay"] { display: none !important; }';

const PASSES = [
  'photoEditor',
  'archivist',
  'reporter',
  'managingEditor',
  'generalist',
  'rescuer',
  'none',
] as const;

/** The top edge of every pass, in picker order. */
async function passTops(page: Page): Promise<number[]> {
  const tops: number[] = [];
  for (const pass of PASSES) {
    const box = await page.getByTestId(`role-pass-${pass}`).boundingBox();
    tops.push(Math.round(box?.y ?? -1));
  }
  return tops;
}

/** Number of distinct rows the passes sit in (the chosen pass lifts by a few pixels). */
function rows(tops: readonly number[]): number {
  const sorted = [...tops].sort((a, b) => a - b);
  let count = 0;
  let last = Number.NEGATIVE_INFINITY;
  for (const top of sorted) {
    if (top - last > 12) {
      count++;
      last = top;
    }
  }
  return count;
}

async function noSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('Ratownik and Wszechstronny: passes, teammate marks and the detail panel', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'covers desktop and phone in one run');
  const host = await openPlayer(browser, 'Zośka', DESKTOP);
  const phone = await openPlayer(browser, 'Łukasz', PHONE);
  const code = await createRoom(host);
  await joinRoom(phone, code, { ready: false });

  // Seven passes in one row at 1366×768; the panel starts on „Bez roli”.
  expect(rows(await passTops(host.page))).toBe(1);
  await expect(host.page.getByTestId('role-detail')).toHaveAttribute('data-role', 'none');
  await expect(host.page.getByTestId('role-detail-ability')).toContainText('Bez zdolności');

  await pickRole(host, 'Ratownik');
  await expect(rosterRow(phone, 'Zośka').getByTestId('roster-role')).toHaveText('Ratownik');
  await host.page.mouse.move(0, 0);
  const hostPanel = host.page.getByTestId('role-detail');
  await expect(hostPanel).toHaveAttribute('data-role', 'rescuer');
  await expect(host.page.getByTestId('role-detail-passive')).toContainText(
    'Raz ratuje teczkę w ręce (+20 s)',
  );
  const hostAbility = host.page.getByTestId('role-detail-ability');
  await expect(hostAbility).toContainText('Podaj teczkę');
  await expect(hostAbility.locator('kbd')).toHaveText('R');
  await expect(hostAbility).toContainText('co 60 s');
  // The phone sees the host's mark on the Ratownik pass.
  await expect(
    phone.page.getByTestId('role-pass-rescuer').getByTestId('role-pass-dots').locator('svg'),
  ).toHaveCount(1);

  await pickRole(phone, 'Wszechstronny');
  await expect(rosterRow(host, 'Łukasz').getByTestId('roster-role')).toHaveText('Wszechstronny');
  await expect(phone.page.getByTestId('role-detail')).toHaveAttribute('data-role', 'generalist');
  await expect(phone.page.getByTestId('role-detail-passive')).toContainText(
    'Wszędzie praca o 20% szybciej',
  );
  const phoneAbility = phone.page.getByTestId('role-detail-ability');
  await expect(phoneAbility).toContainText('Druga szansa');
  await expect(phoneAbility.locator('kbd')).toHaveText('Przycisk');
  await expect(
    host.page.getByTestId('role-pass-generalist').getByTestId('role-pass-dots').locator('svg'),
  ).toHaveCount(1);
  await expect(phone.page.getByTestId('role-note')).toHaveCount(0);

  // Hovering another pass previews it; leaving the passes goes back to the chosen role.
  await host.page.getByTestId('role-pass-archivist').hover();
  await expect(hostPanel).toHaveAttribute('data-role', 'archivist');
  await expect(host.page.getByTestId('role-detail-stations')).toHaveText('Archiwum');
  await host.page.getByTestId('role-pass-reporter').hover();
  await expect(hostPanel).toHaveAttribute('data-role', 'reporter');
  // The training level has no phone: the reporter's perks do nothing there.
  await expect(host.page.getByTestId('role-note')).toHaveText(
    'Ta premia nie działa na tym poziomie.',
  );
  await host.page.mouse.move(0, 0);
  await expect(hostPanel).toHaveAttribute('data-role', 'rescuer');

  await noSideScroll(host.page);
  await noSideScroll(phone.page);
  await host.page.addStyleTag({ content: HIDE_PERF });
  await phone.page.addStyleTag({ content: HIDE_PERF });
  await host.page.getByTestId('role-detail').scrollIntoViewIfNeeded();
  await host.page.screenshot({ path: testInfo.outputPath('lobby-roles-1366x768.png') });
  await phone.page
    .getByTestId('role-detail')
    .evaluate((panel) => panel.scrollIntoView({ block: 'end' }));
  await phone.page.screenshot({ path: testInfo.outputPath('lobby-roles-863x360.png') });
});

test('at 640×360 the passes are four compact rows and the start bar stays in view', async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'opens its own 640×360 phone');
  const player = await openPlayer(browser, 'Zośka', SMALL_PHONE);
  await createRoom(player);
  await pickRole(player, 'Wszechstronny');
  const tops = await passTops(player.page);
  expect(rows(tops)).toBe(2);
  // Four passes per row: the first four share the top row.
  const firstRow = tops.slice(0, 4);
  expect(Math.max(...firstRow) - Math.min(...firstRow)).toBeLessThanOrEqual(8);
  for (const pass of PASSES) {
    const box = await player.page.getByTestId(`role-pass-${pass}`).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }
  await expect(player.page.getByTestId('role-detail-ability')).toContainText('Druga szansa');
  await expect(player.page.getByRole('button', { name: 'Do składu!' })).toBeInViewport();
  await noSideScroll(player.page);
  await pickRole(player, 'Ratownik');
  await expect(player.page.getByTestId('role-detail')).toHaveAttribute('data-role', 'rescuer');
  await player.page.addStyleTag({ content: HIDE_PERF });
  await player.page
    .getByTestId('role-detail')
    .evaluate((panel) => panel.scrollIntoView({ block: 'end' }));
  await player.page.screenshot({ path: testInfo.outputPath('lobby-roles-640x360.png') });
});
