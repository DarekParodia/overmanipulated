// CLI: validates every file in levels/ and stories/ (registered in src/files.ts or not) and
// exits 1 on errors. Run in CI via `bun run validate:content`.
//
//   bun src/validate.ts            validate the real content
//   bun src/validate.ts <root>     validate another content root with levels/ and stories/
//                                  (fixtures); skips the src/files.ts registration check
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type ContentFile,
  checkRegistration,
  formatIssue,
  type Issue,
  validateContent,
} from './checks.ts';

const packageRoot = resolve(import.meta.dir, '..');
const rootArg = process.argv[2];
const root = rootArg ? resolve(rootArg) : packageRoot;

const issues: Issue[] = [];
/** Every .json file found, with its contents when it is valid JSON. */
const onDisk: { file: string; data?: unknown }[] = [];

function load(dir: 'levels' | 'stories'): ContentFile[] {
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
issues.push(...validateContent(levels, stories));
if (!rootArg) {
  try {
    // Imported only now, so invalid JSON in a registered file is reported above, not thrown here.
    const { LEVEL_FILES, STORY_FILES } = await import('./files.ts');
    issues.push(...checkRegistration(onDisk, { ...LEVEL_FILES, ...STORY_FILES }));
  } catch (error) {
    issues.push({ severity: 'error', file: 'src/files.ts', path: '', message: String(error) });
  }
}

for (const issue of issues) {
  console.log(formatIssue(issue));
}
const errors = issues.filter((issue) => issue.severity === 'error').length;
const warnings = issues.length - errors;
console.log(
  `content: ${levels.length} level file(s), ${stories.length} story file(s): ${errors} error(s), ${warnings} warning(s)`,
);
if (errors > 0) {
  process.exit(1);
}
