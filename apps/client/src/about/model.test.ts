import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { VoiceSprite } from '../intro/voice-sprite.ts';
import {
  CREDITS_URL,
  type FetchText,
  loadCredits,
  scrollTarget,
  type TextResponse,
  voiceCreditLine,
} from './model.ts';

const CREDITS_FILE = new URL('../../public/assets/CREDITS.md', import.meta.url);

function serve(response: Partial<TextResponse>): { get: FetchText; urls: string[] } {
  const urls: string[] = [];
  return {
    urls,
    get: async (url) => {
      urls.push(url);
      return { ok: true, contentType: 'text/markdown; charset=utf-8', text: '', ...response };
    },
  };
}

describe('loadCredits', () => {
  it('fetches /assets/CREDITS.md and parses headings, lists and tables', async () => {
    const { get, urls } = serve({
      text: '# Zasoby\n\nWstęp z **pogrubieniem**.\n\n- jeden\n- dwa\n\n| Zasób | Licencja |\n| --- | --- |\n| Font | SIL OFL 1.1 |',
    });
    const state = await loadCredits(get);
    expect(urls).toEqual(['/assets/CREDITS.md']);
    expect(CREDITS_URL).toBe('/assets/CREDITS.md');
    expect(state).toEqual({
      status: 'ready',
      blocks: [
        { type: 'heading', level: 1, children: [{ type: 'text', text: 'Zasoby' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'text', text: 'Wstęp z ' },
            { type: 'bold', children: [{ type: 'text', text: 'pogrubieniem' }] },
            { type: 'text', text: '.' },
          ],
        },
        {
          type: 'list',
          items: [[{ type: 'text', text: 'jeden' }], [{ type: 'text', text: 'dwa' }]],
        },
        {
          type: 'table',
          header: [[{ type: 'text', text: 'Zasób' }], [{ type: 'text', text: 'Licencja' }]],
          rows: [[[{ type: 'text', text: 'Font' }], [{ type: 'text', text: 'SIL OFL 1.1' }]]],
        },
      ],
    });
  });

  it('parses the shipped CREDITS.md into a title, the allowed-licence list and the asset table', async () => {
    const text = readFileSync(CREDITS_FILE, 'utf8');
    const state = await loadCredits(serve({ text }).get);
    expect(state.status).toBe('ready');
    if (state.status !== 'ready') return;
    expect(state.blocks[0]).toEqual({
      type: 'heading',
      level: 1,
      children: [{ type: 'text', text: 'Asset credits' }],
    });
    expect(state.blocks.map((block) => block.type)).toEqual([
      'heading',
      'paragraph',
      'list',
      'paragraph',
      'table',
    ]);
    const list = state.blocks.find((block) => block.type === 'list');
    expect(list?.type === 'list' ? list.items.length : 0).toBe(2);
    const table = state.blocks.find((block) => block.type === 'table');
    expect(table?.type).toBe('table');
    if (table?.type !== 'table') return;
    expect(table.header).toHaveLength(4);
    expect(table.rows.length).toBeGreaterThanOrEqual(7);
  });

  it('is an error when offline, on a 404, on an HTML fallback page or when empty', async () => {
    const offline: FetchText = () => Promise.reject(new TypeError('Failed to fetch'));
    expect(await loadCredits(offline)).toEqual({ status: 'error' });
    expect(await loadCredits(serve({ ok: false, text: 'Not found' }).get)).toEqual({
      status: 'error',
    });
    expect(await loadCredits(serve({ contentType: 'text/html', text: '# Nie to' }).get)).toEqual({
      status: 'error',
    });
    expect(
      await loadCredits(serve({ contentType: 'text/plain', text: '  <!doctype html><html>' }).get),
    ).toEqual({ status: 'error' });
    expect(await loadCredits(serve({ text: '\n\n' }).get)).toEqual({ status: 'error' });
  });
});

const SPRITE: VoiceSprite = {
  voice: 'nagranie-ochotnika',
  source: 'recording',
  licence: 'self-recorded-CC0',
  clips: {},
};

describe('voiceCreditLine', () => {
  it('says the voice is pending without a sprite', () => {
    expect(voiceCreditLine(null)).toBe(
      'Czekamy na nagranie ochotnika. Do tego czasu wprowadzenie ma tylko napisy.',
    );
  });

  it('reads the speaker and the licence from the sprite', () => {
    expect(voiceCreditLine(SPRITE)).toBe('nagranie-ochotnika – licencja CC0 1.0.');
    expect(voiceCreditLine({ ...SPRITE, credit: 'anonimowy ochotnik' })).toBe(
      'anonimowy ochotnik – licencja CC0 1.0.',
    );
    expect(voiceCreditLine({ ...SPRITE, licence: 'CC-BY-4.0', credit: 'Głos: A. Przykład' })).toBe(
      'Głos: A. Przykład – licencja CC BY 4.0.',
    );
  });
});

describe('scrollTarget', () => {
  it('scrolls 60 % of the visible height, clamped to the ends', () => {
    expect(scrollTarget(0, 200, 1000, 1)).toBe(120);
    expect(scrollTarget(120, 200, 1000, 1)).toBe(240);
    expect(scrollTarget(750, 200, 1000, 1)).toBe(800);
    expect(scrollTarget(240, 200, 1000, -1)).toBe(120);
    expect(scrollTarget(100, 200, 1000, -1)).toBe(0);
  });

  it('is null at the end it moves towards, so the focus moves instead', () => {
    expect(scrollTarget(800, 200, 1000, 1)).toBeNull();
    expect(scrollTarget(0, 200, 1000, -1)).toBeNull();
    expect(scrollTarget(0, 200, 150, 1)).toBeNull();
  });
});
