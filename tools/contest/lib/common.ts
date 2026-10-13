// Shared helpers of the contest-materials generators (S6-03): repo paths, content access, icon
// rendering, the print font CSS and the Playwright launcher. Everything here is deterministic so
// re-running `bun run contest:build` only changes files whose inputs changed.
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
// The client's React lives in apps/client/node_modules; resolve it from there so the icon
// components render to static SVG markup without a second React copy.
// @ts-expect-error untyped deep import
import { createElement } from '../../../apps/client/node_modules/react/index.js';
// @ts-expect-error untyped deep import
import { renderToStaticMarkup } from '../../../apps/client/node_modules/react-dom/server.node.js';
import { pl } from '../../../apps/client/src/strings/pl.ts';
import { Icon, type IconName } from '../../../apps/client/src/ui/icons/Icon.tsx';
import { RoleIcon, type RoleIconName } from '../../../apps/client/src/ui/icons/RoleIcon.tsx';
import { colors } from '../../../apps/client/src/ui/tokens.ts';
import { LEVELS, STORIES } from '../../../packages/content/src/index.ts';
import type { StationKind } from '../../../packages/shared/src/index.ts';

export { colors, LEVELS, pl, STORIES };

export const ROOT = resolve(import.meta.dir, '../../..');
export const OUT = resolve(ROOT, 'docs/contest');

export function outPath(...parts: string[]): string {
  return resolve(OUT, ...parts);
}

export async function writeOut(path: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, data);
}

export function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Static SVG markup of a UI icon, drawn in `color` with an optional tint fill. */
export function iconSvg(name: IconName, size: number, color: string, tint?: string): string {
  const svg = renderToStaticMarkup(createElement(Icon, { name, size }));
  return withColors(svg, color, tint);
}

export function roleIconSvg(
  role: RoleIconName,
  size: number,
  color: string,
  tint?: string,
): string {
  const svg = renderToStaticMarkup(createElement(RoleIcon, { role, size }));
  return withColors(svg, color, tint);
}

function withColors(svg: string, color: string, tint?: string): string {
  return svg.replaceAll('currentColor', color).replaceAll('var(--icon-fill, none)', tint ?? 'none');
}

/** Level numbers as shown in the game: the training level is 0. */
export function levelNumber(id: string): number {
  const match = /^l(\d+)-/.exec(id);
  return match?.[1] ? Number(match[1]) : 0;
}

export function levelById(id: string) {
  const level = LEVELS.find((candidate) => candidate.id === id);
  if (!level) {
    throw new Error(`Unknown level ${id}`);
  }
  return level;
}

export function storyById(id: string) {
  const story = STORIES.find((candidate) => candidate.id === id);
  if (!story) {
    throw new Error(`Unknown story ${id}`);
  }
  return story;
}

/** Fonts copied into docs/contest/assets/fonts by `copyFonts`, referenced relatively. */
export function fontCss(prefix: string): string {
  const face = (family: string, file: string, range: string) =>
    `@font-face{font-family:'${family}';font-weight:400 800;font-style:normal;font-display:block;` +
    `src:url('${prefix}assets/fonts/${file}') format('woff2');unicode-range:${range};}`;
  const latin =
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
  const latinExt =
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
  return [
    face('Baloo 2', 'baloo-2-latin.woff2', latin),
    face('Baloo 2', 'baloo-2-latin-ext.woff2', latinExt),
    face('Nunito', 'nunito-latin.woff2', latin),
    face('Nunito', 'nunito-latin-ext.woff2', latinExt),
  ].join('\n');
}

export async function copyFonts(): Promise<void> {
  const base = resolve(ROOT, 'apps/client/node_modules/@fontsource-variable');
  const pairs: [string, string][] = [
    ['baloo-2/files/baloo-2-latin-wght-normal.woff2', 'baloo-2-latin.woff2'],
    ['baloo-2/files/baloo-2-latin-ext-wght-normal.woff2', 'baloo-2-latin-ext.woff2'],
    ['nunito/files/nunito-latin-wght-normal.woff2', 'nunito-latin.woff2'],
    ['nunito/files/nunito-latin-ext-wght-normal.woff2', 'nunito-latin-ext.woff2'],
  ];
  for (const [from, to] of pairs) {
    await writeOut(
      outPath('assets/fonts', to),
      new Uint8Array(await Bun.file(resolve(base, from)).arrayBuffer()),
    );
  }
}

/** Playwright Chromium: PW_CHROMIUM_PATH, the sandbox build, or Playwright's own download. */
export function launchOptions(): { executablePath?: string } {
  const fromEnv = process.env.PW_CHROMIUM_PATH;
  if (fromEnv) {
    return { executablePath: fromEnv };
  }
  return existsSync('/opt/pw-browsers/chromium')
    ? { executablePath: '/opt/pw-browsers/chromium' }
    : {};
}

export async function launchBrowser() {
  return chromium.launch(launchOptions());
}

/** Renders an HTML/SVG file (file:// URL) to a PNG of the given viewport. */
export async function renderPng(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  htmlPath: string,
  pngPath: string,
  width: number,
  height: number | 'auto',
  scale = 1,
): Promise<void> {
  const page = await browser.newPage({
    viewport: { width, height: height === 'auto' ? 800 : height },
    deviceScaleFactor: scale,
  });
  await page.goto(`file://${htmlPath}`);
  await page.evaluate(() => document.fonts.ready);
  if (height === 'auto') {
    // Size the viewport to the document; full-page capture of a bare SVG document can hang.
    const size = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        w: Math.ceil(Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0)),
        h: Math.ceil(Math.max(root.scrollHeight, document.body?.scrollHeight ?? 0)),
      };
    });
    await page.setViewportSize({ width: Math.max(width, size.w), height: size.h });
  }
  await page.screenshot({ path: pngPath });
  await page.close();
}

export const PRIORITY_LABEL = pl.vocab.priorities;
export const TYPE_LABEL = pl.vocab.storyTypes;

const help = pl.stationHelp.kinds;

/** What each station checks, in one short Polish line: the in-game station help's purpose. */
export const STATION_PURPOSE = {
  imageSearch: help.imageSearch.purpose,
  archive: help.archive.purpose,
  sourceRegistry: help.sourceRegistry.purpose,
  phone: help.phone.purpose,
  aiScanner: help.aiScanner.purpose,
  dataLibrary: help.dataLibrary.purpose,
} satisfies Record<StationKind, string>;

export const ICON_FOR_STATION = {
  imageSearch: 'imageSearch',
  archive: 'archive',
  sourceRegistry: 'sourceRegistry',
  phone: 'phone',
  aiScanner: 'aiScanner',
  dataLibrary: 'dataLibrary',
} as const satisfies Record<string, IconName>;
