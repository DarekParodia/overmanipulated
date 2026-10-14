import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { appVersion, authorsFrom, copyrightLine, shortSha } from './build-info.ts';

describe('copyrightLine', () => {
  it('finds the copyright line of a licence text', () => {
    expect(
      copyrightLine(
        'LICENCJA\n\n  Copyright © 2026 Kamil Wida. Wszelkie prawa zastrzeżone.  \n\n1. Prawa.',
      ),
    ).toBe('Copyright © 2026 Kamil Wida. Wszelkie prawa zastrzeżone.');
    expect(copyrightLine('Bez praw\r\nautorskich')).toBeNull();
  });

  it("reads the repository's LICENSE", () => {
    const licence = readFileSync(new URL('../../../../LICENSE', import.meta.url), 'utf8');
    expect(copyrightLine(licence)).toBe('Copyright © 2026 Kamil Wida. Wszelkie prawa zastrzeżone.');
  });
});

describe('authorsFrom', () => {
  it('names the authors between the year and the first full stop', () => {
    expect(authorsFrom('Copyright © 2026 Kamil Wida. Wszelkie prawa zastrzeżone.')).toEqual([
      'Kamil Wida',
    ]);
    expect(authorsFrom('Copyright © 2025–2026 Ala Nowak, Jan Kos i Ola Lis. Prawa.')).toEqual([
      'Ala Nowak',
      'Jan Kos',
      'Ola Lis',
    ]);
    expect(authorsFrom('Copyright by nobody')).toEqual([]);
  });
});

describe('version', () => {
  it('keeps a short sha, cuts a full one, falls back to dev', () => {
    expect(shortSha('1a2b3c4\n')).toBe('1a2b3c4');
    expect(shortSha('1A2B3C4D')).toBe('1a2b3c4d');
    expect(shortSha('0123456789abcdef0123456789abcdef01234567')).toBe('0123456');
    expect(shortSha('')).toBe('dev');
    expect(shortSha(null)).toBe('dev');
    expect(shortSha(undefined)).toBe('dev');
    expect(shortSha('fatal: not a git repository')).toBe('dev');
  });

  it('joins the package version and the sha', () => {
    expect(appVersion('0.0.0', '1a2b3c4')).toBe('0.0.0+1a2b3c4');
    expect(appVersion('1.2.0', 'dev')).toBe('1.2.0+dev');
  });
});
