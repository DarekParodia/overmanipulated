import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BUDGET,
  EXTRAS_SOURCES,
  extrasGraph,
  isExtrasKey,
  lazyGraph,
  linkedFiles,
  type Manifest,
  rangeCovers,
  requestedFonts,
  staticGraph,
  voiceFiles,
} from './check-bundle.ts';

const manifest: Manifest = {
  'index.html': {
    file: 'assets/index.js',
    css: ['assets/index.css'],
    imports: ['shared'],
    isEntry: true,
    dynamicImports: ['game'],
  },
  shared: { file: 'assets/shared.js' },
  game: { file: 'assets/game.js', css: ['assets/game.css'], imports: ['shared', 'three'] },
  three: { file: 'assets/three.js' },
};

describe('bundle graph', () => {
  it('follows static imports and css of the entry', () => {
    expect(staticGraph(manifest, 'index.html').sort()).toEqual([
      'assets/index.css',
      'assets/index.js',
      'assets/shared.js',
    ]);
  });

  it('counts only the files a lazy import adds to the entry graph', () => {
    expect(lazyGraph(manifest, 'index.html').sort()).toEqual([
      'assets/game.css',
      'assets/game.js',
      'assets/three.js',
    ]);
  });
});

// S7-96: the lazy dialogs („Jak grać”, intro, „O grze”, profile) are their own route.
const withExtras: Manifest = {
  'index.html': {
    file: 'assets/index.js',
    css: ['assets/index.css'],
    imports: ['shared'],
    isEntry: true,
    dynamicImports: ['game', 'src/howto/HowToPlayDialog.tsx', 'src/about/AboutDialog.tsx'],
  },
  shared: { file: 'assets/shared.js' },
  game: { file: 'assets/game.js', css: ['assets/game.css'], imports: ['shared', 'three', 'kit'] },
  three: { file: 'assets/three.js' },
  kit: { file: 'assets/kit.js' },
  'src/howto/HowToPlayDialog.tsx': {
    file: 'assets/HowToPlayDialog.js',
    css: ['assets/HowToPlayDialog.css'],
    imports: ['shared', 'kit', 'help'],
    dynamicImports: ['src/intro/IntroPlayer.tsx'],
  },
  help: { file: 'assets/help.js', dynamicImports: ['src/intro/IntroPlayer.tsx'] },
  'src/intro/IntroPlayer.tsx': { file: 'assets/IntroPlayer.js', imports: ['shared'] },
  'src/about/AboutDialog.tsx': { file: 'assets/AboutDialog.js', imports: ['help'] },
};

describe('extras route', () => {
  it('knows the four extras folders and the 1 MB guard', () => {
    expect(EXTRAS_SOURCES).toEqual(['src/intro/', 'src/howto/', 'src/about/', 'src/profile/']);
    expect(BUDGET.extrasMax).toBe(1024 * 1024);
    expect(isExtrasKey('src/howto/HowToPlayDialog.tsx')).toBe(true);
    expect(isExtrasKey('src/profile/ProfileDialog.tsx')).toBe(true);
    expect(isExtrasKey('src/screens/GameScreen.tsx')).toBe(false);
    expect(isExtrasKey('_kit-abc.js')).toBe(false);
  });

  it('keeps the extras out of the game route', () => {
    expect(lazyGraph(withExtras, 'index.html', isExtrasKey).sort()).toEqual([
      'assets/game.css',
      'assets/game.js',
      'assets/kit.js',
      'assets/three.js',
    ]);
  });

  it('counts each extras file once, after the menu and the game', () => {
    const game = lazyGraph(withExtras, 'index.html', isExtrasKey);
    expect(extrasGraph(withExtras, 'index.html', game).sort()).toEqual([
      'assets/AboutDialog.js',
      'assets/HowToPlayDialog.css',
      'assets/HowToPlayDialog.js',
      'assets/IntroPlayer.js',
      'assets/help.js',
    ]);
  });

  it('counts a chunk shared with the game when the game files are not given', () => {
    expect(extrasGraph(withExtras, 'index.html')).toContain('assets/kit.js');
  });

  it('is empty without extras', () => {
    expect(extrasGraph(manifest, 'index.html')).toEqual([]);
  });

  it('lists the voice audio of one format with its sprite json', () => {
    const dist = mkdtempSync(join(tmpdir(), 'check-bundle-'));
    try {
      expect(voiceFiles(dist, 'webm')).toEqual([]);
      mkdirSync(join(dist, 'assets/voice'), { recursive: true });
      for (const name of ['intro.webm', 'intro.mp3', 'intro.json', 'README.txt']) {
        writeFileSync(join(dist, 'assets/voice', name), 'x');
      }
      expect(voiceFiles(dist, 'webm')).toEqual([
        'assets/voice/intro.json',
        'assets/voice/intro.webm',
      ]);
      expect(voiceFiles(dist, 'mp3')).toEqual([
        'assets/voice/intro.json',
        'assets/voice/intro.mp3',
      ]);
    } finally {
      rmSync(dist, { recursive: true, force: true });
    }
  });
});

describe('font subsets', () => {
  const css = `
    @font-face{font-family:A;src:url(/assets/a-latin.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131}
    @font-face{font-family:A;src:url(/assets/a-latin-ext.woff2) format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5}
    @font-face{font-family:A;src:url(/assets/a-cyrillic.woff2) format("woff2");unicode-range:U+0301,U+0400-045F}
    @font-face{font-family:A;src:url(/assets/a-devanagari.woff2) format("woff2");unicode-range:U+0900-097F,U+1CD0-1CF9}
    @font-face{font-family:B;src:url(/assets/b-all.woff2) format("woff2")}`;

  it('keeps the subsets that cover Polish text and drops the rest', () => {
    expect(requestedFonts(css)).toEqual([
      '/assets/a-latin.woff2',
      '/assets/a-latin-ext.woff2',
      '/assets/b-all.woff2',
    ]);
  });

  it('reads unicode-range lists and wildcards', () => {
    expect(rangeCovers('U+0100-02BA, U+1E00-1EFF', 0x141)).toBe(true);
    expect(rangeCovers('U+04??', 0x41)).toBe(false);
    expect(rangeCovers('U+00??', 0x41)).toBe(true);
  });
});

describe('linked files', () => {
  it('lists root-relative hrefs and srcs', () => {
    const html =
      '<link rel="icon" href="/icons/icon.svg"><script src="/assets/a.js"></script><a href="https://x.y/z">';
    expect(linkedFiles(html)).toEqual(['icons/icon.svg', 'assets/a.js']);
  });
});
