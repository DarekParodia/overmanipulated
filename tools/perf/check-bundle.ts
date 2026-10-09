// First-load budget check (S5-07). Reads the production build in apps/client/dist (run
// `bun run build` first, or use `bun run perf:budget`) and measures what a player transfers:
//
//   menu   the first screen: index.html, the entry chunk and its static imports, CSS, the font
//          files the CSS can actually request for Polish text, public files linked from the HTML
//          and the menu music.
//   game   what the first match adds: the lazy game chunk graph, its CSS, the SFX sprite and the
//          level music layers.
//
// Text files (js, css, html, json, svg) are measured gzip-compressed and brotli-compressed, as
// Caddy serves them (`encode zstd gzip`); fonts and audio are already compressed and counted raw.
// Audio ships in two formats (webm, mp3 fallback); the larger set is what a budget must survive.
// The hard limit is the project's 10 MB first-load rule; the lower limits are regression guards
// that fail long before the hard one so a stray import of three.js into the menu is noticed.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const KB = 1024;
const MB = 1024 * KB;

export const BUDGET = {
  /** Plan rule (AGENTS.md, rule 10): menu + first game load, whichever audio format is larger. */
  firstLoadMax: 10 * MB,
  /** Guard: the first screen alone (JS+CSS+fonts+menu music), gzip. */
  menuMax: 700 * KB,
  /** Guard: JS and CSS of the first screen, gzip. Fails if three.js lands in the menu bundle. */
  menuCodeMax: 320 * KB,
  /** Guard: everything the first match adds to the menu load, gzip. */
  gameMax: 1.6 * MB,
} as const;

export type FileCost = { path: string; raw: number; gzip: number; brotli: number };
export type RouteCost = { files: FileCost[]; raw: number; gzip: number; brotli: number };

type ManifestEntry = {
  file: string;
  css?: string[];
  imports?: string[];
  dynamicImports?: string[];
  isEntry?: boolean;
  src?: string;
};
export type Manifest = Record<string, ManifestEntry>;

const TEXT_TYPES = new Set(['.js', '.css', '.html', '.json', '.svg', '.webmanifest', '.mjs']);

export function costOf(path: string, bytes: Uint8Array): FileCost {
  const text = TEXT_TYPES.has(extname(path));
  return {
    path,
    raw: bytes.length,
    gzip: text ? gzipSync(bytes, { level: 9 }).length : bytes.length,
    brotli: text
      ? brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length
      : bytes.length,
  };
}

export function sum(files: FileCost[]): RouteCost {
  return {
    files,
    raw: files.reduce((a, f) => a + f.raw, 0),
    gzip: files.reduce((a, f) => a + f.gzip, 0),
    brotli: files.reduce((a, f) => a + f.brotli, 0),
  };
}

/** Chunk files reachable through static imports from a manifest key (JS and CSS). */
export function staticGraph(manifest: Manifest, key: string): string[] {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (k: string) => {
    if (seen.has(k)) {
      return;
    }
    seen.add(k);
    const entry = manifest[k];
    if (!entry) {
      return;
    }
    files.add(entry.file);
    for (const css of entry.css ?? []) {
      files.add(css);
    }
    for (const imported of entry.imports ?? []) {
      visit(imported);
    }
  };
  visit(key);
  return [...files];
}

/** All chunk files of a dynamically imported subtree, minus what the parent already loaded. */
export function lazyGraph(manifest: Manifest, entryKey: string): string[] {
  const entry = manifest[entryKey];
  const already = new Set(staticGraph(manifest, entryKey));
  const files = new Set<string>();
  for (const dynamicKey of entry?.dynamicImports ?? []) {
    for (const file of staticGraph(manifest, dynamicKey)) {
      if (!already.has(file)) {
        files.add(file);
      }
    }
  }
  return [...files];
}

/**
 * Font files a stylesheet can request for Polish text. Each `@font-face` carries a
 * `unicode-range`; browsers only fetch a face when the page has a glyph in its range, so the
 * Cyrillic, Devanagari and Vietnamese subsets never load. A face counts when its range covers
 * basic Latin (A = U+0041) or the Polish letter Ł (U+0141); faces without a range always count.
 */
export function requestedFonts(css: string): string[] {
  const files: string[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const url = /url\(([^)]+?\.woff2)\)/.exec(block)?.[1]?.replace(/["']/g, '');
    if (!url) {
      continue;
    }
    const range = /unicode-range:\s*([^;}]+)/.exec(block)?.[1];
    if (range === undefined || rangeCovers(range, 0x41) || rangeCovers(range, 0x141)) {
      files.push(url);
    }
  }
  return files;
}

export function rangeCovers(range: string, codePoint: number): boolean {
  for (const part of range.split(',')) {
    const m = /U\+([0-9a-fA-F?]+)(?:-([0-9a-fA-F]+))?/.exec(part.trim());
    if (!m?.[1]) {
      continue;
    }
    if (m[1].includes('?')) {
      const low = Number.parseInt(m[1].replaceAll('?', '0'), 16);
      const high = Number.parseInt(m[1].replaceAll('?', 'F'), 16);
      if (codePoint >= low && codePoint <= high) {
        return true;
      }
      continue;
    }
    const low = Number.parseInt(m[1], 16);
    const high = m[2] ? Number.parseInt(m[2], 16) : low;
    if (codePoint >= low && codePoint <= high) {
      return true;
    }
  }
  return false;
}

/** Local files linked from the HTML head/body (icons, manifest, scripts, styles). */
export function linkedFiles(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
    if (m[1]) {
      out.push(m[1].slice(1));
    }
  }
  return out;
}

export type Report = {
  menu: RouteCost;
  game: RouteCost;
  /** menu + game for the larger audio format */
  total: { gzip: number; brotli: number; raw: number; audioFormat: string };
  violations: string[];
};

function readCost(dist: string, path: string): FileCost {
  return costOf(path, readFileSync(join(dist, path)));
}

function audioFiles(dist: string, ext: string): { menu: string[]; game: string[] } {
  const menu: string[] = [];
  const game: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(dist, dir))) {
      const rel = posix.join(dir, name);
      if (statSync(join(dist, rel)).isDirectory()) {
        walk(rel);
      } else if (name.endsWith(`.${ext}`)) {
        (name.startsWith('menu.') ? menu : game).push(rel);
      }
    }
  };
  if (existsSync(join(dist, 'assets/audio'))) {
    walk('assets/audio');
  }
  return { menu, game };
}

export function measure(dist: string): Report {
  const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8')) as Manifest;
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const entryKey = Object.keys(manifest).find((k) => manifest[k]?.isEntry);
  if (!entryKey) {
    throw new Error('no entry chunk in the Vite manifest');
  }

  const menuChunks = staticGraph(manifest, entryKey);
  const css = menuChunks.filter((f) => f.endsWith('.css'));
  const fonts = css.flatMap((f) =>
    requestedFonts(readFileSync(join(dist, f), 'utf8')).map((url) =>
      posix.join('assets', posix.basename(url)),
    ),
  );
  const linked = linkedFiles(html).filter(
    (f) => existsSync(join(dist, f)) && !menuChunks.includes(f),
  );
  const gameChunks = lazyGraph(manifest, entryKey);

  const reports = ['webm', 'mp3'].map((ext) => {
    const audio = audioFiles(dist, ext);
    const menu = sum(
      ['index.html', ...menuChunks, ...fonts, ...linked, ...audio.menu]
        .filter((f, i, all) => all.indexOf(f) === i)
        .map((f) => readCost(dist, f)),
    );
    const game = sum([...gameChunks, ...audio.game].map((f) => readCost(dist, f)));
    return { ext, menu, game };
  });
  const largest = reports.reduce((a, b) =>
    b.menu.gzip + b.game.gzip > a.menu.gzip + a.game.gzip ? b : a,
  );

  const menuCode = sum(
    largest.menu.files.filter((f) => f.path.endsWith('.js') || f.path.endsWith('.css')),
  );
  const total = {
    gzip: largest.menu.gzip + largest.game.gzip,
    brotli: largest.menu.brotli + largest.game.brotli,
    raw: largest.menu.raw + largest.game.raw,
    audioFormat: largest.ext,
  };
  const violations: string[] = [];
  const limit = (what: string, value: number, max: number) => {
    if (value > max) {
      violations.push(`${what}: ${kb(value)} exceeds ${kb(max)}`);
    }
  };
  limit('first load (menu + game, gzip)', total.gzip, BUDGET.firstLoadMax);
  limit('first load (menu + game, raw, no compression at all)', total.raw, BUDGET.firstLoadMax);
  limit('menu route (gzip)', largest.menu.gzip, BUDGET.menuMax);
  limit('menu JS+CSS (gzip)', menuCode.gzip, BUDGET.menuCodeMax);
  limit('game route extra (gzip)', largest.game.gzip, BUDGET.gameMax);
  return { menu: largest.menu, game: largest.game, total, violations };
}

export function kb(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(2)} MB` : `${(bytes / KB).toFixed(0)} KB`;
}

function table(name: string, route: RouteCost): string {
  const rows = route.files
    .map(
      (f) =>
        `  ${f.path.padEnd(56)} ${kb(f.raw).padStart(8)} ${kb(f.gzip).padStart(8)} ${kb(f.brotli).padStart(8)}`,
    )
    .join('\n');
  return `${name}\n${'  file'.padEnd(58)} ${'raw'.padStart(8)} ${'gzip'.padStart(8)} ${'brotli'.padStart(8)}\n${rows}\n  ${'total'.padEnd(56)} ${kb(route.raw).padStart(8)} ${kb(route.gzip).padStart(8)} ${kb(route.brotli).padStart(8)}`;
}

if (import.meta.main) {
  const dist = process.argv[2] ?? 'apps/client/dist';
  if (!existsSync(join(dist, '.vite/manifest.json'))) {
    console.error(`${dist}/.vite/manifest.json not found: run "bun run build" first.`);
    process.exit(2);
  }
  const report = measure(dist);
  console.log(table('MENU (first screen)', report.menu));
  console.log();
  console.log(table('GAME (added by the first match)', report.game));
  console.log();
  console.log(
    `first load total (${report.total.audioFormat} audio): ${kb(report.total.raw)} raw, ${kb(report.total.gzip)} gzip, ${kb(report.total.brotli)} brotli (limit ${kb(BUDGET.firstLoadMax)})`,
  );
  if (report.violations.length > 0) {
    console.error(`\nBundle budget exceeded:\n- ${report.violations.join('\n- ')}`);
    process.exit(1);
  }
  console.log('bundle budget: ok');
}
