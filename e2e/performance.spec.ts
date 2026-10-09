import { type Browser, expect, type Page, test } from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, type Player, trackContext } from './helpers.ts';

// Render budget (AGENTS.md rule 10): <= 100k triangles, ~150 draw calls on desktop and ~100 on
// phones, with 4 players and 7 folders on screen, on the heaviest preset. The counters come from
// three's renderer.info through the ?debug overlay (the same numbers as the perf overlay shows).
const MAX_TRIANGLES = 100_000;
const MAX_DRAW_CALLS = { desktop: 150, mobile: 100 } as const;

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
  await context.addInitScript((quality) => {
    localStorage.setItem('redakcja.settings.v1', JSON.stringify({ quality }));
  }, quality);
  const page = await context.newPage();
  await page.goto('/?debug');
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, nickname, touch };
}

test.afterEach(closePlayers);

test('4 players and 7 folders stay inside the render budget on the high preset', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name === 'mobile';
  const host = await openWithQuality(browser, 'Zośka', mobile, true);
  const guests = await Promise.all(
    ['Łukasz', 'Ola', 'Kamil'].map((name) => openWithQuality(browser, name, mobile, false)),
  );
  const code = await createRoom(host);
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
});
