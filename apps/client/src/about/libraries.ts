// Open-source libraries the game is built on (S7-103), for „O grze” → Biblioteki. Static on
// purpose (no licence scraping at build time); libraries.test.ts keeps it honest: every runtime
// dependency of apps/client and apps/server is listed, nothing else, each with the licence its
// installed package.json declares. Workspace packages (`@redakcja/*`) are the project's own.

/** Where a library runs: in the player's browser or on the game server. */
export type LibrarySide = 'client' | 'server';

export type Library = {
  name: string;
  /** SPDX id, as the package declares it. */
  licence: string;
  side: LibrarySide;
};

export const LIBRARIES: readonly Library[] = [
  { name: 'react', licence: 'MIT', side: 'client' },
  { name: 'react-dom', licence: 'MIT', side: 'client' },
  { name: 'three', licence: 'MIT', side: 'client' },
  { name: '@react-three/fiber', licence: 'MIT', side: 'client' },
  { name: '@react-three/drei', licence: 'MIT', side: 'client' },
  { name: 'zustand', licence: 'MIT', side: 'client' },
  { name: 'howler', licence: 'MIT', side: 'client' },
  { name: 'zod', licence: 'MIT', side: 'client' },
  { name: 'hono', licence: 'MIT', side: 'client' },
  { name: '@fontsource-variable/baloo-2', licence: 'OFL-1.1', side: 'client' },
  { name: '@fontsource-variable/nunito', licence: 'OFL-1.1', side: 'client' },
  { name: 'hono', licence: 'MIT', side: 'server' },
  { name: '@hono/bun', licence: 'MIT', side: 'server' },
  { name: '@hono/zod-validator', licence: 'MIT', side: 'server' },
  { name: 'drizzle-orm', licence: 'Apache-2.0', side: 'server' },
  { name: 'drizzle-zod', licence: 'Apache-2.0', side: 'server' },
  { name: 'zod', licence: 'MIT', side: 'server' },
];

/** The libraries of one side, in list order. */
export function librariesOf(side: LibrarySide): Library[] {
  return LIBRARIES.filter((library) => library.side === side);
}
