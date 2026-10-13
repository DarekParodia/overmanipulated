import {
  type Browser,
  type BrowserContextOptions,
  expect,
  type Page,
  type Route,
  test,
} from '@playwright/test';
import { closePlayers, createRoom, DESKTOP, PHONE, trackContext } from './helpers.ts';

test.afterEach(closePlayers);

// S7-74: ad placements with a stubbed Google script. The real script is never fetched: every
// request to Google's ad host is answered here (or aborted, as an ad blocker would).

const CLIENT = 'ca-pub-1234567890123456';
const GOOGLE = 'https://pagead2.googlesyndication.com/**';
/** AD_MIN_GAP_PX (apps/client/src/ads/placements.ts): ads ≥ 150 px from every control. */
const MIN_GAP_PX = 150;

/** A `publicConfigSchema` body with limited ads on and a unit for the three placements. */
const ADS_CONFIG = {
  revision: 1,
  siteOrigin: null,
  features: { roomBrowser: false, versus: true, spectators: true, intro: true },
  defaultDifficulty: 'normal',
  motd: null,
  ads: {
    enabled: true,
    mode: 'limited',
    client: CLIENT,
    slots: { menu: '1111111111', lobby: '2222222222', results: '3333333333' },
    ageTreatment: 'teen',
  },
};

/**
 * Stand-in for adsbygoogle.js: each `push({})` fills the next unhandled `<ins>` with a box of its
 * size, as Google does; the queue keeps the flags the client wrote on it. It also answers the
 * consent API, counting revocation messages in `window.__revocations`.
 */
const STUB_SCRIPT = `(() => {
  const queue = (window.adsbygoogle = window.adsbygoogle || []);
  const fill = () => {
    const ins = document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status])');
    if (!ins) return;
    ins.setAttribute('data-adsbygoogle-status', 'done');
    ins.setAttribute('data-ad-status', 'filled');
    const creative = document.createElement('div');
    creative.style.width = ins.style.width;
    creative.style.height = ins.style.height;
    ins.appendChild(creative);
  };
  for (let i = 0; i < queue.length; i += 1) fill();
  queue.push = () => { fill(); return 0; };
  window.__revocations = 0;
  const fc = (window.googlefc = window.googlefc || {});
  fc.showRevocationMessage = () => { window.__revocations += 1; };
  const callbacks = (fc.callbackQueue = fc.callbackQueue || []);
  const run = (entry) => entry.CONSENT_DATA_READY && entry.CONSENT_DATA_READY();
  callbacks.forEach(run);
  callbacks.push = (entry) => { run(entry); return 0; };
})();`;

type Ads = {
  page: Page;
  /** URLs of every request to Google's ad host. */
  googleRequests: string[];
  /** Console errors logged from the game's own origin. */
  ownErrors: string[];
};

/** Opens the menu with the ads config routed and Google's script stubbed (or blocked). */
async function openWithAds(
  browser: Browser,
  options: BrowserContextOptions,
  { blocked = false }: { blocked?: boolean } = {},
): Promise<Ads> {
  const context = await browser.newContext(options);
  trackContext(context, { ads: true });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw error;
  });
  const googleRequests: string[] = [];
  const ownErrors: string[] = [];
  page.on('console', (message) => {
    const origin = new URL(page.url()).origin;
    if (message.type() === 'error' && message.location().url.startsWith(origin)) {
      ownErrors.push(message.text());
    }
  });
  await page.route('**/api/config', (route) => route.fulfill({ json: ADS_CONFIG }));
  await page.route(GOOGLE, (route: Route) => {
    googleRequests.push(route.request().url());
    return blocked
      ? route.abort('blockedbyclient')
      : route.fulfill({ contentType: 'text/javascript', body: STUB_SCRIPT });
  });
  const answered = page.waitForResponse('**/api/config');
  await page.goto('/?debug');
  await answered;
  await page.getByLabel('Twój podpis').fill('Zośka');
  return { page, googleRequests, ownErrors };
}

/** The ad rail of a placement. */
function rail(page: Page, placement: string) {
  return page.locator(`[data-ad-placement="${placement}"]`);
}

/** Shortest distance from the rail to any visible control outside it and outside dialogs. */
async function gapToControls(page: Page, placement: string): Promise<number> {
  return page.evaluate((placement) => {
    const ad = document.querySelector(`[data-ad-placement="${placement}"]`);
    if (!ad) {
      return -1;
    }
    const a = ad.getBoundingClientRect();
    const controls = document.querySelectorAll(
      'button, a[href], input, select, textarea, label, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
    let nearest = Number.POSITIVE_INFINITY;
    for (const control of controls) {
      if (ad.contains(control) || control.closest('dialog')) {
        continue;
      }
      const b = control.getBoundingClientRect();
      if (b.width === 0 || b.height === 0 || getComputedStyle(control).visibility === 'hidden') {
        continue;
      }
      const dx = Math.max(0, a.left - b.right, b.left - a.right);
      const dy = Math.max(0, a.top - b.bottom, b.top - a.bottom);
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    return nearest;
  }, placement);
}

async function pauseAdRequests(page: Page): Promise<number | undefined> {
  return page.evaluate(
    () =>
      (window as unknown as { adsbygoogle?: { pauseAdRequests?: number } }).adsbygoogle
        ?.pauseAdRequests,
  );
}

type Hook = { setState(state: Record<string, unknown>): void };

/** A won level with one folder: enough for the results plate. */
const LEVEL_END = {
  type: 'levelEnd',
  levelId: 'l0-greybox',
  won: true,
  stars: 1,
  score: 25,
  credibility: 55,
  results: [
    {
      folderId: 'f1',
      spawnKey: 's1',
      storyId: 'l0-zalany-rynek',
      outcome: 'correct',
      reason: 'correctImportant',
      verdict: 'reject',
      scoreDelta: 25,
      credibilityDelta: 5,
      justifyingStampIds: [],
      requiredStamps: 1,
      bonuses: { speed: 0, multiStamp: 0, bossCall: 0 },
      missedStampIds: [],
    },
  ],
  lossReason: null,
  starThresholds: { two: 120, three: 190 },
  maxScore: 240,
};

/** Opens a room, starts the level and shows the results through the ?debug game hook. */
async function playToResults(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Do składu!' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await page.evaluate((levelEnd) => {
    (window as unknown as { __game: Hook }).__game.setState({ levelEnd });
  }, LEVEL_END);
  await expect(page.getByTestId('results')).toBeVisible();
}

test.describe('desktop', () => {
  test.skip(({ isMobile }) => isMobile, 'phones never show ads');

  test('menu and lobby rails keep 150 px from controls, none in play, results only when wide', async ({
    browser,
  }, testInfo) => {
    const { page, googleRequests } = await openWithAds(browser, DESKTOP);

    // Main menu: the left rail, filled, tagged for limited teen ads, far from every control.
    const menu = rail(page, 'menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Reklama');
    const menuIns = menu.locator('ins.adsbygoogle');
    await expect(menuIns).toHaveAttribute('data-ad-status', 'filled');
    await expect(menuIns).toHaveAttribute('data-ad-client', CLIENT);
    await expect(menuIns).toHaveAttribute('data-ad-slot', '1111111111');
    await expect(menuIns).toHaveAttribute('data-tag-for-under-age-of-consent', '1');
    await expect(menuIns).toHaveAttribute('data-tag-for-age-treatment', '2');
    expect(await gapToControls(page, 'menu')).toBeGreaterThanOrEqual(MIN_GAP_PX);
    expect(googleRequests).toHaveLength(1);
    expect(googleRequests[0]).toBe(
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`,
    );
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { adsbygoogle?: { requestNonPersonalizedAds?: number } })
            .adsbygoogle?.requestNonPersonalizedAds,
      ),
    ).toBe(1);
    expect(await pauseAdRequests(page)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('menu-ads.png'), scale: 'css' });

    // The consent link in the footer reopens Google's consent message; it is never yellow.
    const consent = page.getByRole('button', { name: 'Zgody reklamowe' });
    await expect(consent).toBeVisible();
    await consent.click();
    expect(
      await page.evaluate(() => (window as unknown as { __revocations: number }).__revocations),
    ).toBe(1);

    // Lobby: the banner under the footer, as far from the start button and the level card.
    await createRoom({ page, nickname: 'Zośka', touch: false });
    const lobby = rail(page, 'lobby');
    await lobby.scrollIntoViewIfNeeded();
    await expect(lobby).toBeVisible();
    await expect(lobby.locator('ins.adsbygoogle')).toHaveAttribute('data-ad-status', 'filled');
    expect(await gapToControls(page, 'lobby')).toBeGreaterThanOrEqual(MIN_GAP_PX);
    await page.screenshot({
      path: testInfo.outputPath('lobby-ads.png'),
      scale: 'css',
      fullPage: true,
    });
    // Still one script for the page.
    expect(googleRequests).toHaveLength(1);

    // In play: no ad element, and requests are paused.
    await page.getByRole('button', { name: 'Do składu!' }).click();
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.locator('ins.adsbygoogle')).toHaveCount(0);
    expect(await pauseAdRequests(page)).toBe(1);

    // Results at 1366 px: below the 1780 px gate, so no rail; requests may run again.
    await page.evaluate((levelEnd) => {
      (window as unknown as { __game: Hook }).__game.setState({ levelEnd });
    }, LEVEL_END);
    await expect(page.getByTestId('results')).toBeVisible();
    await expect(page.locator('[data-ad-placement]')).toHaveCount(0);
    await expect.poll(() => pauseAdRequests(page)).toBe(0);
  });

  test('the results rail shows from 1780×900, 150 px from every control', async ({
    browser,
  }, testInfo) => {
    const { page } = await openWithAds(browser, { viewport: { width: 1780, height: 900 } });
    await createRoom({ page, nickname: 'Zośka', touch: false });
    await playToResults(page);
    const results = rail(page, 'results');
    await expect(results).toBeVisible();
    await expect(results.locator('ins.adsbygoogle')).toHaveAttribute('data-ad-status', 'filled');
    expect(await gapToControls(page, 'results')).toBeGreaterThanOrEqual(MIN_GAP_PX);
    expect(await pauseAdRequests(page)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('results-ads.png'), scale: 'css' });
  });

  test('with an ad blocker there is no rail, no consent link and no error', async ({ browser }) => {
    const { page, googleRequests, ownErrors } = await openWithAds(browser, DESKTOP, {
      blocked: true,
    });
    await expect.poll(() => googleRequests.length).toBe(1);
    await expect(rail(page, 'menu')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zgody reklamowe' })).toHaveCount(0);
    await createRoom({ page, nickname: 'Zośka', touch: false });
    await expect(page.locator('[data-ad-placement]')).toHaveCount(0);
    // A blocked loader is not tried again.
    expect(googleRequests).toHaveLength(1);
    expect(ownErrors).toEqual([]);
  });
});

test('phones never show ads or load the ad script', async ({ browser, isMobile }) => {
  test.skip(!isMobile, 'the phone check');
  const { page, googleRequests } = await openWithAds(browser, PHONE);
  await expect(page.getByRole('button', { name: 'Otwórz pokój' })).toBeVisible();
  await createRoom({ page, nickname: 'Zośka', touch: true });
  await expect(page.locator('[data-ad-placement]')).toHaveCount(0);
  await playToResults(page);
  await expect(page.locator('[data-ad-placement]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Wyjdź z redakcji' }).click();
  await expect(page.getByRole('button', { name: 'Otwórz pokój' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zgody reklamowe' })).toHaveCount(0);
  expect(googleRequests).toEqual([]);
});
