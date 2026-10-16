// Review state of the stories: `reviewed` is the subject-matter supervisor's sign-off (schema.ts).
// Pure: validate.ts loads the files and prints the counts; `--require-reviewed` adds an error for
// each story file that still has unreviewed stories. The default run only reports them.
import type { ContentFile, Issue } from './checks.ts';

/** Reviewed and total stories of one story file. */
export type ReviewCount = {
  /** Story file, relative to the content root (e.g. `stories/l0-greybox.json`). */
  file: string;
  total: number;
  reviewed: number;
};

/**
 * Counts the stories with `reviewed: true` in each story file. Every array entry counts toward
 * `total`, valid or not, so the totals are the stories on disk; an entry is reviewed only when its
 * `reviewed` is exactly `true`, so a missing field counts as not reviewed. A file that is not an
 * array counts as empty (validate.ts reports it).
 */
export function countReviewed(storyFiles: readonly ContentFile[]): ReviewCount[] {
  return storyFiles.map(({ file, data }) => {
    const entries: unknown[] = Array.isArray(data) ? data : [];
    return { file, total: entries.length, reviewed: entries.filter(isReviewed).length };
  });
}

function isReviewed(entry: unknown): boolean {
  return (
    typeof entry === 'object' && entry !== null && 'reviewed' in entry && entry.reviewed === true
  );
}

/**
 * One error per story file that still has unreviewed stories, with their count. Empty when every
 * story is reviewed.
 */
export function unreviewedIssues(counts: readonly ReviewCount[]): Issue[] {
  const issues: Issue[] = [];
  for (const { file, total, reviewed } of counts) {
    if (reviewed < total) {
      issues.push({
        severity: 'error',
        file,
        path: '',
        message: `${total - reviewed} of ${total} ${total === 1 ? 'story' : 'stories'} not reviewed; --require-reviewed needs all of them`,
      });
    }
  }
  return issues;
}
