// Imports the supervisor's decisions: sets `"reviewed": true` for approved story ids only.
//   bun run review:apply -- <file.csv>                 dry run: shows what would change
//   bun run review:apply -- <file.csv> --write         edits packages/content/stories/*.json
//   --root <dir>   another content root (tests, a copy of the content)
// The tool never sets `reviewed` back to false and never touches any other byte of the files.
// Everything is validated before anything is written; on any problem nothing is written.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatIssue, validateContent } from '../../packages/content/src/checks.ts';
import { loadContent, markReviewed, parseApprovals } from './review-lib.ts';

export type ApplyResult = {
  /** Story ids that change from reviewed:false to reviewed:true. */
  approved: string[];
  alreadyReviewed: string[];
  notApproved: string[];
  /** Stories that are not in the CSV at all. */
  missingFromCsv: string[];
  warnings: string[];
  errors: string[];
  /** New text per story file (relative path), only for files that change. */
  newFiles: Map<string, string>;
};

export function applyApprovals(root: string, csv: string): ApplyResult {
  const parsed = parseApprovals(csv);
  const result: ApplyResult = {
    approved: [],
    alreadyReviewed: [],
    notApproved: [],
    missingFromCsv: [],
    warnings: [...parsed.warnings],
    errors: [...parsed.errors],
    newFiles: new Map(),
  };
  if (result.errors.length > 0) {
    return result;
  }
  const content = loadContent(root);
  const known = new Map(
    [...content.stories.values()].flat().map((story) => [story.id, story] as const),
  );

  for (const decision of parsed.decisions) {
    const story = known.get(decision.id);
    if (!story) {
      result.errors.push(`Wiersz ${decision.line}: nieznane ID historii ${decision.id}.`);
      continue;
    }
    if (decision.approved && decision.comment !== '') {
      result.warnings.push(
        `${decision.id}: zatwierdzona, ale ma uwagę: "${decision.comment}". Upewnij się, że uwaga jest załatwiona.`,
      );
    }
    if (decision.approved) {
      (story.reviewed ? result.alreadyReviewed : result.approved).push(decision.id);
    } else {
      result.notApproved.push(decision.id);
      if (story.reviewed) {
        result.warnings.push(
          `${decision.id}: w CSV bez zatwierdzenia, ale w plikach już jest reviewed: true. Narzędzie niczego nie cofa; zmień ręcznie, jeśli trzeba.`,
        );
      }
    }
  }
  const inCsv = new Set(parsed.decisions.map((d) => d.id));
  result.missingFromCsv = [...known.keys()].filter((id) => !inCsv.has(id));
  if (result.errors.length > 0) {
    return result;
  }

  // Patch the text of each affected file, then check the result is exactly "the same content
  // with those stories reviewed" and still passes the content validation.
  const byFile = new Map<string, string[]>();
  for (const id of result.approved) {
    const file = content.fileOf.get(id) as string;
    byFile.set(file, [...(byFile.get(file) ?? []), id]);
  }
  for (const [file, ids] of byFile) {
    let text = readFileSync(join(root, file), 'utf8');
    for (const id of ids) {
      const patched = markReviewed(text, id);
      if (patched === null) {
        result.errors.push(`${file}: nie udało się znaleźć pola "reviewed" historii ${id}.`);
        continue;
      }
      text = patched;
    }
    const expected = (
      JSON.parse(readFileSync(join(root, file), 'utf8')) as { id: string; reviewed: boolean }[]
    ).map((story) => (ids.includes(story.id) ? { ...story, reviewed: true } : story));
    if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(expected)) {
      result.errors.push(`${file}: zmiana dotknęła czegoś poza polem "reviewed". Przerywam.`);
      continue;
    }
    result.newFiles.set(file, text);
  }
  if (result.errors.length > 0) {
    return result;
  }

  const readJson = (file: string): { file: string; data: unknown } => ({
    file,
    data: JSON.parse(result.newFiles.get(file) ?? readFileSync(join(root, file), 'utf8')),
  });
  const levelFiles = listFiles(root, 'levels');
  const storyFiles = listFiles(root, 'stories');
  const issues = validateContent(levelFiles.map(readJson), storyFiles.map(readJson)).filter(
    (issue) => issue.severity === 'error',
  );
  for (const issue of issues) {
    result.errors.push(`Walidacja treści: ${formatIssue(issue)}`);
  }
  return result;
}

function listFiles(root: string, dir: 'levels' | 'stories'): string[] {
  return readdirSync(join(root, dir))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `${dir}/${name}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const rootIndex = args.indexOf('--root');
  const rootArg = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
  const write = args.includes('--write');
  const csvPath = args.find((a, i) => !a.startsWith('--') && i !== rootIndex + 1);
  if (!csvPath) {
    console.error('usage: bun run review:apply -- <file.csv> [--write] [--root <content-dir>]');
    process.exit(2);
  }
  const root = resolve(rootArg ?? join(import.meta.dir, '..', '..', 'packages', 'content'));
  const result = applyApprovals(root, readFileSync(resolve(csvPath), 'utf8'));

  const list = (title: string, ids: string[]) => {
    if (ids.length > 0) {
      console.log(`${title} (${ids.length}): ${ids.join(', ')}`);
    }
  };
  list(write ? 'Ustawiono reviewed: true' : 'Zostanie ustawione reviewed: true', result.approved);
  list('Już zatwierdzone wcześniej', result.alreadyReviewed);
  list('Bez zatwierdzenia (reviewed bez zmian)', result.notApproved);
  list('Brak w pliku CSV', result.missingFromCsv);
  for (const warning of result.warnings) {
    console.log(`UWAGA: ${warning}`);
  }
  for (const error of result.errors) {
    console.error(`BŁĄD: ${error}`);
  }
  if (result.errors.length > 0) {
    console.error('Nic nie zostało zapisane.');
    process.exit(1);
  }
  if (!write) {
    console.log('\nTo był próbny przebieg: nic nie zapisano. Dodaj --write, aby zapisać zmiany.');
  } else {
    for (const [file, text] of result.newFiles) {
      writeFileSync(join(root, file), text);
      console.log(`zapisano ${join(root, file)}`);
    }
    console.log('Gotowe. Uruchom `bun run validate:content`, a potem zatwierdź zmiany w gicie.');
  }
}
