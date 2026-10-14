// S7-103: „Biblioteki” lists exactly the runtime dependencies of the client and the server, each
// with the licence its installed package declares.
import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { LIBRARIES, type LibrarySide, librariesOf } from './libraries.ts';

const ROOT = new URL('../../../../', import.meta.url);
const APP_DIR: Record<LibrarySide, URL> = {
  client: new URL('apps/client/', ROOT),
  server: new URL('apps/server/', ROOT),
};

type PackageJson = { dependencies?: Record<string, string>; license?: string };

function readJson(url: URL): PackageJson {
  return JSON.parse(readFileSync(url, 'utf8'));
}

/** Third-party runtime dependencies (workspace packages are the project's own). */
function dependencies(side: LibrarySide): string[] {
  const deps = readJson(new URL('package.json', APP_DIR[side])).dependencies ?? {};
  return Object.entries(deps)
    .filter(([, range]) => !range.startsWith('workspace:'))
    .map(([name]) => name)
    .sort();
}

/** The installed package.json: the app's own node_modules first, then the hoisted root. */
function installed(side: LibrarySide, name: string): PackageJson {
  for (const base of [APP_DIR[side], ROOT]) {
    const url = new URL(`node_modules/${name}/package.json`, base);
    if (existsSync(url)) {
      return readJson(url);
    }
  }
  throw new Error(`${name} is not installed`);
}

describe('libraries', () => {
  for (const side of ['client', 'server'] as const) {
    it(`lists every ${side} dependency, and nothing else`, () => {
      expect(
        librariesOf(side)
          .map((library) => library.name)
          .sort(),
      ).toEqual(dependencies(side));
    });

    it(`gives each ${side} library the licence it declares`, () => {
      for (const library of librariesOf(side)) {
        expect(installed(side, library.name).license, library.name).toBe(library.licence);
      }
    });
  }

  it('has no duplicates on one side', () => {
    const keys = LIBRARIES.map((library) => `${library.side}:${library.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('lists the literal client and server sets', () => {
    expect(librariesOf('client')).toHaveLength(11);
    expect(librariesOf('server')).toHaveLength(6);
    expect(LIBRARIES.find((l) => l.name === 'drizzle-orm')?.licence).toBe('Apache-2.0');
    expect(LIBRARIES.find((l) => l.name === '@fontsource-variable/nunito')?.licence).toBe(
      'OFL-1.1',
    );
  });
});
