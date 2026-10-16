// CLI: validates every file in levels/ and stories/ (registered in src/files.ts or not) and
// exits 1 on errors. Run in CI via `bun run validate:content`. It also prints how many stories the
// supervisor has reviewed (`reviewed: true`); `--require-reviewed` adds an error for each story file
// that still has unreviewed stories, for the release checklist.
//
//   bun src/validate.ts                              validate the real content
//   bun src/validate.ts <root>                       validate another content root with levels/ and
//                                                    stories/ (fixtures); skips the src/files.ts
//                                                    registration check
//   bun src/validate.ts --require-reviewed           also exit 1 while any story is unreviewed
//   bun run validate:content -- --require-reviewed   the same, through the workspace script
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type ContentFile,
  checkRegistration,
  formatIssue,
  type Issue,
  validateContent,
  validateTechniques,
} from './checks.ts';
import { countReviewed, unreviewedIssues } from './review.ts';

/**
 * `--require-reviewed` is the only option. Any other option is an error, `-x` included: a misspelt
 * flag must not pass silently, or it would skip the release gate.
 */
function parseCliArgs() {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      options: { 'require-reviewed': { type: 'boolean', default: false } },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    console.error(`invalid arguments: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const cli = parseCliArgs();
const requireReviewed = cli.values['require-reviewed'];
const packageRoot = resolve(import.meta.dir, '..');
const rootArg = cli.positionals[0];
const root = rootArg ? resolve(rootArg) : packageRoot;

const issues: Issue[] = [];
/** Every .json file found, with its contents when it is valid JSON. */
const onDisk: { file: string; data?: unknown }[] = [];

function load(dir: 'levels' | 'stories' | 'techniques'): ContentFile[] {
  const path = join(root, dir);
  if (!existsSync(path)) {
    issues.push({ severity: 'error', file: dir, path: '', message: 'directory not found' });
    return [];
  }
  const files: ContentFile[] = [];
  for (const name of readdirSync(path).sort()) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const file = `${dir}/${name}`;
    try {
      const data: unknown = JSON.parse(readFileSync(join(path, name), 'utf8'));
      files.push({ file, data });
      onDisk.push({ file, data });
    } catch (error) {
      issues.push({ severity: 'error', file, path: '', message: `invalid JSON: ${error}` });
      onDisk.push({ file });
    }
  }
  return files;
}

const levels = load('levels');
const stories = load('stories');
// A fixture root may have no techniques/ directory; the encyclopedia is then not checked.
const checkEncyclopedia = !rootArg || existsSync(join(root, 'techniques'));
const techniques = checkEncyclopedia ? load('techniques') : [];
issues.push(...validateContent(levels, stories));
if (checkEncyclopedia) {
  issues.push(...validateTechniques(techniques, stories));
}
if (!rootArg) {
  try {
    // Imported only now, so invalid JSON in a registered file is reported above, not thrown here.
    const { LEVEL_FILES, STORY_FILES, TECHNIQUE_FILES } = await import('./files.ts');
    issues.push(
      ...checkRegistration(onDisk, { ...LEVEL_FILES, ...STORY_FILES, ...TECHNIQUE_FILES }),
    );
  } catch (error) {
    issues.push({ severity: 'error', file: 'src/files.ts', path: '', message: String(error) });
  }
}

const reviewCounts = countReviewed(stories);
if (requireReviewed) {
  issues.push(...unreviewedIssues(reviewCounts));
}

for (const issue of issues) {
  console.log(formatIssue(issue));
}
const reviewed = reviewCounts.reduce((sum, count) => sum + count.reviewed, 0);
const storyTotal = reviewCounts.reduce((sum, count) => sum + count.total, 0);
console.log(`Stories reviewed: ${reviewed} of ${storyTotal}`);
for (const count of reviewCounts) {
  console.log(`  ${count.file}: ${count.reviewed} of ${count.total}`);
}
const errors = issues.filter((issue) => issue.severity === 'error').length;
const warnings = issues.length - errors;
console.log(
  `content: ${levels.length} level file(s), ${stories.length} story file(s), ${techniques.length} technique file(s): ${errors} error(s), ${warnings} warning(s)`,
);
if (errors > 0) {
  process.exit(1);
}
