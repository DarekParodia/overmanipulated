// Re-runnable generator of all contest materials in docs/contest/ (S6-03).
//   bun run contest:build            maps, cards and the 2-page visualisation (fast, no server)
//   bun run contest:build -- --all   also screenshots and the gameplay video (starts its own stack)
//   bun run contest:build -- --screenshots | --video   only that part
// Set CONTEST_BASE_URL to reuse a running game, CONTEST_REBUILD=1 to rebuild the client first.
import { buildCards } from './cards.ts';
import { buildMaps } from './maps.ts';
import { buildVisualization } from './visualization.ts';

const args = new Set(process.argv.slice(2));
const all = args.has('--all');
const only = args.has('--screenshots') || args.has('--video');

if (!only) {
  console.log((await buildMaps()).join('\n'));
  console.log((await buildCards()).join('\n'));
}
if (all || args.has('--screenshots')) {
  const { buildScreenshots } = await import('./screenshots.ts');
  const missing = await buildScreenshots();
  console.log(JSON.stringify(missing));
}
if (all || args.has('--video')) {
  await (await import('./video.ts')).main();
}
// Last, so it embeds the screenshots refreshed above.
console.log((await buildVisualization()).join('\n'));
process.exit(0);
