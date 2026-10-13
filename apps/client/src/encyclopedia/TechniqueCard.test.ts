// The big encyclopedia card lists the stations that help against a technique, the Stage 7 ones
// (Stenogram, Metadane, Mapa, Inne media) included, each as a chip with its icon (S7-65).
import { describe, expect, it } from 'bun:test';
import { TECHNIQUES } from '@redakcja/content';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardDetail } from './TechniqueCard.tsx';

function detail(id: string): string {
  const technique = TECHNIQUES.find((card) => card.id === id);
  if (!technique) {
    throw new Error(`no technique card "${id}"`);
  }
  return renderToStaticMarkup(
    createElement(CardDetail, { view: { technique, unlocked: true, stories: [] } }),
  );
}

describe('CardDetail station chips (S7-65)', () => {
  it('shows Mapa and Metadane on the old-photo card', () => {
    const html = detail('stare-zdjecie-nowy-podpis');
    for (const name of ['Lupa obrazu', 'Mapa', 'Metadane', 'Archiwum']) {
      expect(html).toContain(`</svg>${name}</li>`);
    }
  });

  it('shows Stenogram and Inne media on the cards that need them', () => {
    expect(detail('zmyslony-cytat')).toContain('</svg>Stenogram</li>');
    expect(detail('plotka-bez-zrodla')).toContain('</svg>Inne media</li>');
  });
});
