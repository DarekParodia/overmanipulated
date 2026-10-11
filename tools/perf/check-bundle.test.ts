import { describe, expect, it } from 'bun:test';
import {
  lazyGraph,
  linkedFiles,
  type Manifest,
  rangeCovers,
  requestedFonts,
  staticGraph,
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
