// Scripted play helpers shared by the screenshot and video generators: opening players, the
// lobby flow, keyboard walking with closed-loop position feedback and the `?debug` game hook.
// Selectors use test ids and accessible names (the same ones the e2e suite relies on) so a UI
// polish pass does not break the scripts.
import type { Browser, BrowserContext, BrowserContextOptions, Page } from '@playwright/test';

export type Player = { page: Page; context: BrowserContext; nickname: string; touch: boolean };

export type Profile = {
  /** Levels (id -> stars) already finished on Normal; unlocks the campaign map. */
  progress?: Record<string, number>;
  tutorialDone?: boolean;
  /** Seeded encyclopedia state (technique id -> story ids), see apps/client/src/encyclopedia. */
  met?: Record<string, string[]>;
  /** Settings overrides stored in localStorage (merged by the app). */
  settings?: Record<string, unknown>;
};

export const ALL_STARS: Record<string, number> = {
  'l1-burza': 3,
  'l2-wybory': 3,
  'l3-afera': 3,
  'l4-zdrowie': 3,
  'l5-deepfake': 3,
};

/** Hides the `?debug` perf overlay, which would sit on top of every screenshot. */
const HIDE_DEBUG_CSS = '[data-testid="perf-overlay"]{display:none!important}';

export async function openPlayer(
  browser: Browser,
  baseUrl: string,
  nickname: string,
  options: BrowserContextOptions,
  profile: Profile = {},
): Promise<Player> {
  const context = await browser.newContext({ ...options, locale: 'pl-PL' });
  await context.addInitScript((p: Profile) => {
    const set = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));
    if (p.progress) {
      // Progress v2 (S7-26): stars per difficulty, then per level.
      set('redakcja.progress.v2', { normal: p.progress });
    }
    if (p.tutorialDone) {
      localStorage.setItem('redakcja.tutorial.done', '1');
    }
    if (p.met) {
      set('redakcja.encyclopedia.v1', p.met);
    }
    if (p.settings) {
      set('redakcja.settings.v1', p.settings);
    }
  }, profile);
  const page = await context.newPage();
  page.on('pageerror', (error) => console.warn(`[${nickname}] page error: ${error.message}`));
  await page.goto(`${baseUrl}/?debug`);
  await page.addStyleTag({ content: HIDE_DEBUG_CSS });
  await page.getByLabel('Twój podpis').fill(nickname);
  return { page, context, nickname, touch: options.hasTouch === true };
}

/** Viewport of a player who only has to be in the room (never photographed or recorded). */
const EXTRA_VIEWPORT = { width: 480, height: 270 };

/**
 * Opens a player who only fills a seat: a small canvas on the cheapest preset. Pass a browser
 * other than the photographed player's. Chromium runs every page's WebGL in one GPU process, so
 * under software GL the scenes of all pages in a browser compile and draw on one queue: four
 * full-size players starting a level at once froze each page's main thread for 15–40 s (the
 * 'HUD within 30 s' timeout of Room A), while a page alone in its browser waits about 5 s.
 */
export async function openExtraPlayer(
  browser: Browser,
  baseUrl: string,
  nickname: string,
  profile: Profile = {},
): Promise<Player> {
  return openPlayer(
    browser,
    baseUrl,
    nickname,
    { viewport: EXTRA_VIEWPORT },
    { ...profile, settings: { ...profile.settings, quality: 'low' } },
  );
}

export async function createRoom(host: Player): Promise<string> {
  await host.page.getByRole('button', { name: 'Otwórz pokój' }).click();
  const code = host.page.getByTestId('room-code');
  await code.waitFor();
  await host.page.waitForFunction(() =>
    /^[A-Z]{4}$/.test(document.querySelector('[data-testid="room-code"]')?.textContent ?? ''),
  );
  return ((await code.textContent()) ?? '').trim();
}

export async function joinRoom(player: Player, code: string): Promise<void> {
  await player.page.getByLabel('Kod pokoju').fill(code);
  await player.page.getByRole('button', { name: 'Dołącz' }).click();
  await player.page.getByTestId('room-code').waitFor();
}

/** Ticks "Gotowy" and waits for the server to confirm. Select the level first: it resets it. */
export async function setReady(player: Player): Promise<void> {
  const box = player.page.getByRole('checkbox', { name: 'Gotowy' });
  await box.waitFor({ state: 'attached' });
  if (!(await box.isChecked())) {
    await player.page.locator('label').filter({ has: box }).click();
  }
  await player.page.waitForFunction(
    () => document.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked === true,
  );
}

export async function pickRole(player: Player, roleName: string): Promise<void> {
  const pass = player.page.getByRole('radio', { name: roleName });
  await player.page.locator('label').filter({ has: pass }).click();
  await pass.waitFor();
  await player.page.waitForFunction(
    (name) =>
      [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')].some(
        (input) => input.checked && input.closest('label')?.textContent?.includes(name),
      ),
    roleName,
  );
}

export async function selectLevel(host: Player, levelId: string): Promise<void> {
  await host.page.getByTestId(`level-tile-${levelId}`).click();
  await host.page.waitForTimeout(400);
}

/** Host presses "Do składu!" and every player confirms the briefing with "Gotowy!". */
export async function startAndBrief(host: Player, others: Player[]): Promise<void> {
  await host.page.getByRole('button', { name: 'Do składu!' }).click();
  for (const player of [host, ...others]) {
    await player.page.getByRole('button', { name: 'Gotowy!' }).waitFor();
  }
}

/** How long a page may take from „Gotowy!” to its HUD (scene compile under software GL). */
const HUD_TIMEOUT_MS = 60_000;

export async function confirmBriefing(players: Player[]): Promise<void> {
  for (const player of players) {
    await player.page.getByRole('button', { name: 'Gotowy!' }).click();
  }
  await Promise.all(
    players.map((player) => player.page.getByTestId('hud').waitFor({ timeout: HUD_TIMEOUT_MS })),
  );
}

// --- Game state through the debug hook ----------------------------------------------------

export type Pos = { x: number; y: number };

/** Positions of all avatars as this client renders them, in tile units, keyed by nickname. */
export async function positions(player: Player): Promise<Record<string, Pos>> {
  return player.page.evaluate(() => {
    const scene = (
      window as unknown as {
        __scene?: {
          traverse(
            fn: (o: { name: string; visible: boolean; position: { x: number; z: number } }) => void,
          ): void;
        };
      }
    ).__scene;
    const out: Record<string, { x: number; y: number }> = {};
    scene?.traverse((object) => {
      if (object.name.startsWith('player:') && object.visible) {
        out[object.name.slice('player:'.length)] = { x: object.position.x, y: object.position.z };
      }
    });
    return out;
  });
}

type GameWindow = {
  __game: {
    getState(): {
      folders: {
        id: string;
        storyId: string;
        stamps: string[];
        location: { kind: string; fixtureId?: string; playerId?: string };
      }[];
      stations: { id: string; kind: string; phase: string; operatorId: string | null }[];
      desks: { id: string; operatorId: string | null }[];
    };
    map(): { fixtures: { id: string; kind: string; station?: string; col: number; row: number }[] };
    localPlayerId(): string | null;
  };
};

export async function gameInfo(player: Player) {
  return player.page.evaluate(() => {
    const g = (window as unknown as GameWindow).__game;
    const state = g.getState();
    return {
      me: g.localPlayerId(),
      folders: state.folders,
      stations: state.stations,
      desks: state.desks,
      fixtures: g.map().fixtures,
    };
  });
}

// --- Keyboard walking ---------------------------------------------------------------------

/**
 * Walks the player's avatar to `target` (tile units) with WASD, re-reading its position every
 * step. Stops within `tolerance` tiles or after `timeoutMs`.
 */
export async function walkTo(
  player: Player,
  target: Pos,
  { tolerance = 0.25, timeoutMs = 9000 }: { tolerance?: number; timeoutMs?: number } = {},
): Promise<void> {
  const { page } = player;
  const until = Date.now() + timeoutMs;
  const held = new Set<string>();
  const hold = async (keys: string[]) => {
    for (const key of [...held]) {
      if (!keys.includes(key)) {
        await page.keyboard.up(key);
        held.delete(key);
      }
    }
    for (const key of keys) {
      if (!held.has(key)) {
        await page.keyboard.down(key);
        held.add(key);
      }
    }
  };
  try {
    while (Date.now() < until) {
      const me = (await positions(player))[player.nickname];
      if (!me) {
        await page.waitForTimeout(100);
        continue;
      }
      const dx = target.x - me.x;
      const dy = target.y - me.y;
      if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) {
        return;
      }
      const keys: string[] = [];
      if (Math.abs(dx) >= tolerance) {
        keys.push(dx > 0 ? 'KeyD' : 'KeyA');
      }
      if (Math.abs(dy) >= tolerance) {
        keys.push(dy > 0 ? 'KeyS' : 'KeyW');
      }
      if (Math.hypot(dx, dy) > 1.6) {
        await hold(keys);
        await page.waitForTimeout(60);
      } else {
        // Close in with short taps and let the (delayed) avatar position settle between them.
        await hold(keys);
        await page.waitForTimeout(45);
        await hold([]);
        await page.waitForTimeout(220);
      }
    }
  } finally {
    await hold([]);
  }
}

/** Pushes against a solid fixture for a moment so the avatar turns to face it. */
export async function faceTowards(
  player: Player,
  key: 'KeyW' | 'KeyA' | 'KeyS' | 'KeyD',
  ms = 250,
): Promise<void> {
  await player.page.keyboard.down(key);
  await player.page.waitForTimeout(ms);
  await player.page.keyboard.up(key);
}
