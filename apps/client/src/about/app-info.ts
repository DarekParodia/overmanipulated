// What the build knows about itself (S7-103): vite.config.ts `define`s these from the client's
// package.json, git and the repository's LICENSE (`about/build-info.ts`). Outside a Vite build
// (bun test) the constants do not exist, so each one falls back to a neutral value.
import { PROTOCOL_VERSION } from '@redakcja/shared';

declare const __APP_VERSION__: string | undefined;
declare const __APP_COPYRIGHT__: string | undefined;
declare const __APP_AUTHORS__: readonly string[] | undefined;

export type AppInfo = {
  /** `<package version>+<git sha>`, e.g. `0.0.0+1a2b3c4`. */
  version: string;
  /** The LICENSE's copyright line. */
  copyright: string;
  /** The authors named in it. */
  authors: readonly string[];
  protocol: number;
};

export const APP_INFO: AppInfo = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
  copyright: typeof __APP_COPYRIGHT__ === 'string' ? __APP_COPYRIGHT__ : '',
  authors: typeof __APP_AUTHORS__ === 'object' && __APP_AUTHORS__ !== null ? __APP_AUTHORS__ : [],
  protocol: PROTOCOL_VERSION,
};
