// Fails when a colour literal appears in client source outside the design-token files
// (agents/design-rules.md §3). Run via `bun run lint:design`.
import { Glob } from 'bun';

const ROOT = 'apps/client/src';
const ALLOWED = new Set(['apps/client/src/ui/tokens.css', 'apps/client/src/ui/tokens.ts']);
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|lab|lch)\(/g;
/** Data URIs (procedural textures) encode colours as matrices, not literals; skip url(...) values. */
const DATA_URI = /url\((["'])data:[^)]*\1\)/g;

const problems: string[] = [];
for await (const path of new Glob(`${ROOT}/**/*.{ts,tsx,css}`).scan('.')) {
  if (ALLOWED.has(path) || path.endsWith('.test.ts')) {
    continue;
  }
  const lines = (await Bun.file(path).text()).split('\n');
  lines.forEach((line, index) => {
    const stripped = line.replace(DATA_URI, '');
    for (const match of stripped.matchAll(COLOR)) {
      // `url(#id)` references to SVG defs are not colours.
      if (/url\($/.test(stripped.slice(0, match.index))) {
        continue;
      }
      problems.push(`${path}:${index + 1}: colour literal "${match[0]}" — use a design token`);
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} colour literal(s) outside the token files.`);
  process.exit(1);
}
console.log('design tokens: ok');
