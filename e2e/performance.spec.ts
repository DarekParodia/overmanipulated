import { type Browser, expect, type Page, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, type Player, trackContext } from './helpers.ts';

// Render budget (AGENTS.md rule 10): <= 100k triangles, ~150 draw calls on desktop and ~100 on
// phones, with 4 players and 7 folders on screen, on the heaviest preset. The counters come from
// three's renderer.info through the ?debug overlay (the same numbers as the perf overlay shows).
// Measured in the default level-1 room and in the three 24×14 rooms of M4 (S7-66): level 5
// (7 stations), level 6 (8 stations) and endless (all 10 stations).
const MAX_TRIANGLES = 100_000;
const MAX_DRAW_CALLS = { desktop: 150, mobile: 100 } as const;

/** Rooms to measure: `null` keeps the lobby's default level. */
const ROOMS = [
  { name: 'level 1', levelId: null },
  { name: 'level 5 (24×14, 7 stations)', levelId: 'l5-deepfake' },
  { name: 'level 6 (24×14, 8 stations)', levelId: 'l6-atak' },
  { name: 'endless (24×14, 10 stations)', levelId: 'endless' },
] as const;

/** Every campaign level won on Normal, so the host can pick l5, l6 and endless. */
const PROGRESS = {
  normal: { 'l1-burza': 3, 'l2-wybory': 3, 'l3-afera': 3, 'l4-zdrowie': 3, 'l5-deepfake': 3 },
};

type Counters = { drawCalls: number; triangles: number };

async function readCounters(page: Page): Promise<Counters> {
  const text = await page.getByTestId('perf-overlay').innerText();
  const value = (label: string) =>
    Number(new RegExp(`${label}\\s+(\\d+)`).exec(text.replace(/\n/g, ' '))?.[1] ?? Number.NaN);
  return { drawCalls: value('draw calls'), triangles: value('triangles') };
}

async function openWithQuality(
  browser: Browser,
  nickname: string,
  touch: boolean,
  measured: boolean,
): Promise<Player> {
  // Only the measured page needs a full-size, high-quality canvas; the other three players just
  // have to exist, so they render small and cheap (software GL would crawl with four big ones).
  const context = await browser.newContext(
    measured ? (touch ? PHONE : DESKTOP) : { viewport: { width: 480, height: 270 } },
  );
  // Registered so closePlayers() in afterEach disposes of it like the helper's own contexts.
  trackContext(context);
  const quality = measured ? 'high' : 'low';
  await context.addInitScript(
    ({ quality, progress }) => {
      localStorage.setItem('redakcja.settings.v1', JSON.stringify({ quality }));
      localStorage.setItem('redakcja.progress.v2', JSON.stringify(progress));
    },
    { quality, progress: PROGRESS },
  );
  const page = await context.newPage();
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch };
}

test.afterEach(closePlayers);

for (const room of ROOMS) {
  test(`${room.name}: 4 players and 7 folders stay inside the render budget on the high preset`, async ({
    browser,
  }, testInfo) => {
    await measureRoom(browser, room.levelId, testInfo.project.name === 'mobile');
  });
}

async function measureRoom(browser: Browser, levelId: string | null, mobile: boolean) {
  test.setTimeout(150_000);
  const host = await openWithQuality(browser, 'Zośka', mobile, true);
  const guests = await Promise.all(
    ['Łukasz', 'Ola', 'Kamil'].map((name) => openWithQuality(browser, name, mobile, false)),
  );
  const code = await createRoom(host);
  if (levelId !== null) {
    // Before the guests join: choosing a level clears their ready ticks.
    const tile = host.page.getByTestId(`level-tile-${levelId}`);
    await tile.click();
    // The radio follows the server's room state.
    await expect(tile.getByRole('radio')).toBeChecked();
  }
  for (const guest of guests) {
    await guest.page.getByLabel('Kod pokoju').fill(code);
    await guest.page.getByRole('button', { name: 'Dołącz' }).click();
    await expect(guest.page.getByTestId('room-code')).toHaveText(code);
    const box = guest.page.getByRole('checkbox', { name: 'Gotowy' });
    await guest.page.locator('label').filter({ has: box }).click();
    await expect(box).toBeChecked();
  }
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(host.page.getByTestId('hud')).toBeVisible({ timeout: 40_000 });

  await host.page.evaluate(() => {
    const game = (
      window as unknown as {
        __game: {
          inject(state: { folders: unknown[] }): void;
          getState(): { folders: { storyId: string }[] };
        };
      }
    ).__game;
    const storyId = game.getState().folders[0]?.storyId ?? 's';
    game.inject({
      folders: Array.from({ length: 7 }, (_, i) => ({
        id: `perf-${i}`,
        spawnKey: `s${i}`,
        storyId,
        location: { kind: 'floor', x: 4 + i * 1.5, y: 5 + (i % 3) },
        stamps: i % 2 ? ['x'] : [],
        spawnedAtMs: 0,
        deadlineMs: 999_999,
        warned: false,
      })),
    });
  });
  await host.page.waitForTimeout(2500);

  const full = await readCounters(host.page);
  expect(full.drawCalls).toBeGreaterThan(5);
  expect(full.drawCalls).toBeLessThanOrEqual(MAX_DRAW_CALLS[mobile ? 'mobile' : 'desktop']);
  expect(full.triangles).toBeLessThanOrEqual(MAX_TRIANGLES);

  // Adaptive quality's last step really is cheaper (fewer draw calls, never more).
  await host.page.evaluate(() => {
    (window as unknown as { __quality: { getState(): { setStage(n: number): void } } }).__quality
      .getState()
      .setStage(99);
  });
  await host.page.waitForTimeout(1500);
  const cut = await readCounters(host.page);
  expect(cut.drawCalls).toBeLessThanOrEqual(full.drawCalls);
  expect(cut.triangles).toBeLessThanOrEqual(full.triangles);
  // The numbers docs/performance.md records (`--reporter=list` prints them).
  console.log(`perf ${levelId ?? 'default'} ${mobile ? 'mobile' : 'desktop'}`, { full, cut });
}
