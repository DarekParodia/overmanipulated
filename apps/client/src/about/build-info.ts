// Build-time facts for „O grze” (S7-103), computed by vite.config.ts and handed to the app as
// `define` constants (`about/app-info.ts` reads them). Pure and import-free on purpose:
// vite.config loads this file before any bundling, so it must not pull zod or the shared package.

/** The copyright line of the repository's LICENSE (`Copyright © 2026 Kamil Wida. …`), or null. */
export function copyrightLine(licence: string): string | null {
  for (const raw of licence.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^copyright\b/i.test(line)) {
      return line;
    }
  }
  return null;
}

/**
 * The authors named in a copyright line: what stands between `© <year>` and the first full stop,
 * split on commas and „i”/„and”. `Copyright © 2026 Kamil Wida. …` → `['Kamil Wida']`.
 */
export function authorsFrom(copyright: string): string[] {
  const match = /©\s*\d{4}(?:\s*[–-]\s*\d{4})?\s+([^.]+)\./.exec(copyright);
  const names = match?.[1] ?? '';
  return names
    .split(/\s*(?:,|\bi\b|\band\b)\s*/)
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/** Characters of a full sha kept, like `git rev-parse --short`. */
const SHORT_SHA_LENGTH = 7;

/**
 * A short git sha, or `dev` when there is none (a build outside a checkout). A short sha (as
 * `git rev-parse --short` prints it) stays as it is; a full one is cut to 7 characters.
 */
export function shortSha(raw: string | null | undefined): string {
  const sha = (raw ?? '').trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) {
    return 'dev';
  }
  return sha.length === 40 ? sha.slice(0, SHORT_SHA_LENGTH) : sha;
}

/** The version shown in „O grze”: `<package version>+<git sha>`, e.g. `0.0.0+1a2b3c4`. */
export function appVersion(packageVersion: string, sha: string): string {
  return `${packageVersion}+${sha}`;
}
