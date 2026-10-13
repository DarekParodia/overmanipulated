import { describe, expect, it } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pl } from '../../strings/pl.ts';
import { LANDMARKS } from './geolocation.logic.ts';
import { LandmarkGlyph } from './landmarks.tsx';

const markup = (landmark: (typeof LANDMARKS)[number]) =>
  renderToStaticMarkup(createElement(LandmarkGlyph, { landmark }));

describe('landmark glyphs', () => {
  it('draws every landmark as a decorative 24×24 glyph', () => {
    for (const landmark of LANDMARKS) {
      const svg = markup(landmark);
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain(`data-landmark="${landmark}"`);
    }
  });

  it('uses only the two token colours, so shape alone tells the glyphs apart', () => {
    const colours = new Set<string>();
    for (const landmark of LANDMARKS) {
      for (const [, colour] of markup(landmark).matchAll(/(?:fill|stroke)="([^"]+)"/g)) {
        colours.add(colour ?? '');
      }
    }
    expect([...colours].sort()).toEqual(['none', 'var(--outline)', 'var(--surface)']);
  });

  it('gives each of the ten landmarks its own shape', () => {
    // With the colours identical, distinct geometry is the only thing left to differ.
    const shapes = LANDMARKS.map((landmark) =>
      markup(landmark).replace(/ data-landmark="[^"]+"/, ''),
    );
    expect(new Set(shapes).size).toBe(10);
  });

  it('names every landmark for screen readers', () => {
    expect(Object.keys(pl.minigames.geolocation.landmarks).sort()).toEqual([...LANDMARKS].sort());
  });
});
