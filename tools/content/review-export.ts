// Exports every story (levels 0-6 and their events) for the subject-matter supervisor.
//   bun run review:export [-- --root packages/content --out docs/review]
// Writes stories-for-review.md (to read) and stories-for-review.csv (to fill in; import with
// `bun run review:apply`). Rebuilt from the content files on every run; never edit the output.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildRows, loadContent, toCsv, toMarkdown } from './review-lib.ts';

export function exportReview(root: string, outDir: string): { stories: number; files: string[] } {
  const content = loadContent(root);
  const rows = buildRows(content);
  mkdirSync(outDir, { recursive: true });
  const md = join(outDir, 'stories-for-review.md');
  const csv = join(outDir, 'stories-for-review.csv');
  writeFileSync(md, toMarkdown(content, rows));
  writeFileSync(csv, toCsv(rows));
  return { stories: rows.length, files: [md, csv] };
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const option = (name: string, fallback: string): string => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? (args[i + 1] as string) : fallback;
  };
  const repo = resolve(import.meta.dir, '..', '..');
  const result = exportReview(
    resolve(option('--root', join(repo, 'packages', 'content'))),
    resolve(option('--out', join(repo, 'docs', 'review'))),
  );
  console.log(`review:export: ${result.stories} stories`);
  for (const file of result.files) {
    console.log(`  wrote ${file}`);
  }
}
