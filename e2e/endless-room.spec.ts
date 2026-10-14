// S7-64: endless runs all ten stations in its 24×14 room. Two tabs start it and both see the same
// map with every station fixture, and the server's game holds one station of every kind.
import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  test,
} from '@playwright/test';
import {
  closePlayers,
  DESKTOP,
  joinRoom,
  openPlayer,
  PHONE,
  type Player,
  trackContext,
} from './helpers.ts';

test.afterEach(closePlayers);

type Hook = {
  map(): {
    width: number;
    height: number;
    fixtures: { id: string; kind: string; station?: string }[];
  };
  getState(): { stations: { id: string; kind: string }[] };
};

/** Level 1 won, so endless is open on this browser. */
const PROGRESS = { 'l1-burza': 3 };

async function openHost(browser: Browser, options: BrowserContextOptions): Promise<Player> {
  const context = await browser.newContext(options);
  trackContext(context);
  await context.addInitScript((progress) => {
    localStorage.setItem('redakcja.progress.v1', JSON.stringify(progress));
  }, PROGRESS);
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, nickname: 'Zośka', touch: options.hasTouch === true };
}

/** The room as this tab sees it: size, its station fixtures and the server's station kinds. */
async function room(page: Page) {
  return page.evaluate(() => {
    const game = (window as unknown as { __game: Hook }).__game;
    const map = game.map();
    return {
      size: [map.width, map.height],
      fixtures: map.fixtures.filter((f) => f.kind === 'station').map((f) => f.id),
      stations: game
        .getState()
        .stations.map((s) => s.kind)
        .sort(),
    };
  });
}

test('endless starts with all ten stations in two tabs', async ({ browser }, testInfo) => {
  test.slow();
  const options =
    testInfo.project.name === 'desktop'
      ? DESKTOP
      : { ...PHONE, viewport: { width: 640, height: 360 } };
  const host = await openHost(browser, options);
  const guest = await openPlayer(browser, 'Łukasz', options);
  await host.page.getByRole('button', { name: 'Otwórz pokój' }).click();
  const code = host.page.getByTestId('room-code');
  await expect(code).toHaveText(/^[A-Z]{4}$/);
  await host.page.getByTestId('level-tile-endless').click();
  await joinRoom(guest, (await code.textContent()) ?? '');
  await expect(guest.page.getByTestId('level-card')).toContainText('Tryb bez końca');
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  // Software WebGL on a loaded machine starves two tabs; the checks below need no scene.
  for (const player of [host, guest]) {
    await player.page.addStyleTag({ content: 'canvas { display: none !important; }' });
  }

  // Reading order: the back wall I A R Q E, then the front row P S L G X.
  const fixtures = [
    'imageSearch-0',
    'archive-0',
    'sourceRegistry-0',
    'transcript-0',
    'metadata-0',
    'phone-0',
    'aiScanner-0',
    'dataLibrary-0',
    'geolocation-0',
    'crossCheck-0',
  ];
  const kinds = [
    'aiScanner',
    'archive',
    'crossCheck',
    'dataLibrary',
    'geolocation',
    'imageSearch',
    'metadata',
    'phone',
    'sourceRegistry',
    'transcript',
  ];
  for (const player of [host, guest]) {
    await expect(player.page.getByTestId('hud')).toBeVisible();
    await expect(player.page.getByTestId('hud-tempo')).toBeVisible();
    await expect
      .poll(() => room(player.page))
      .toEqual({ size: [24, 14], fixtures, stations: kinds });
  }
});
