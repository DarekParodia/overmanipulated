import { describe, expect, it } from 'bun:test';
import {
  inlineText,
  isSafeHref,
  type MdInline,
  markdownTitle,
  parseInline,
  parseMarkdownLite,
  splitTableRow,
} from './markdown-lite.ts';

const text = (value: string): MdInline => ({ type: 'text', text: value });

describe('parseMarkdownLite blocks', () => {
  it('parses headings of levels 1 to 3 and keeps #### as text', () => {
    expect(parseMarkdownLite('# Tytuł\n## Dział\n### Pod\n#### Nie')).toEqual([
      { type: 'heading', level: 1, children: [text('Tytuł')] },
      { type: 'heading', level: 2, children: [text('Dział')] },
      { type: 'heading', level: 3, children: [text('Pod')] },
      { type: 'paragraph', children: [text('#### Nie')] },
    ]);
  });

  it('joins soft line breaks and splits paragraphs on blank lines', () => {
    expect(parseMarkdownLite('Pierwsza\nlinia\n\nDruga')).toEqual([
      { type: 'paragraph', children: [text('Pierwsza linia')] },
      { type: 'paragraph', children: [text('Druga')] },
    ]);
  });

  it('parses a list, with an indented line continuing its item', () => {
    expect(parseMarkdownLite('Wstęp\n- jeden,\n  dalej\n- dwa\nKoniec')).toEqual([
      { type: 'paragraph', children: [text('Wstęp')] },
      { type: 'list', items: [[text('jeden, dalej')], [text('dwa')]] },
      { type: 'paragraph', children: [text('Koniec')] },
    ]);
  });

  it('parses a pipe table with a rule row', () => {
    expect(
      parseMarkdownLite('| Dane | Jak długo |\n| --- | :---: |\n| Pseudonim | **90 dni** |'),
    ).toEqual([
      {
        type: 'table',
        header: [[text('Dane')], [text('Jak długo')]],
        rows: [[[text('Pseudonim')], [{ type: 'bold', children: [text('90 dni')] }]]],
      },
    ]);
  });

  it('reads pipe lines without a rule row as a paragraph', () => {
    expect(parseMarkdownLite('| a | b |\n| c | d |')).toEqual([
      { type: 'paragraph', children: [text('| a | b | | c | d |')] },
    ]);
  });

  it('drops authoring comments', () => {
    expect(parseMarkdownLite('<!-- notatka dla autora -->\nTekst')).toEqual([
      { type: 'paragraph', children: [text('Tekst')] },
    ]);
  });

  it('takes the title from the first level-1 heading', () => {
    expect(markdownTitle(parseMarkdownLite('Wstęp\n\n## Nie\n\n# **Prywatność** w grze'))).toBe(
      'Prywatność w grze',
    );
    expect(markdownTitle(parseMarkdownLite('Bez tytułu'))).toBeNull();
  });
});

describe('parseMarkdownLite conditional blocks', () => {
  const DOC =
    '<!-- ads -->\nSą reklamy.\n<!-- /ads -->\n<!-- no-ads -->\nNie ma reklam.\n<!-- /no-ads -->';

  it('keeps a block only when its flag is true', () => {
    expect(parseMarkdownLite(DOC, { flags: { ads: true, 'no-ads': false } })).toEqual([
      {
        type: 'section',
        name: 'ads',
        children: [{ type: 'paragraph', children: [text('Są reklamy.')] }],
      },
    ]);
    expect(parseMarkdownLite(DOC, { flags: { ads: false, 'no-ads': true } })).toEqual([
      {
        type: 'section',
        name: 'no-ads',
        children: [{ type: 'paragraph', children: [text('Nie ma reklam.')] }],
      },
    ]);
  });

  it('drops a block whose flag is unknown, and ends a paragraph at a marker', () => {
    expect(parseMarkdownLite('Przed\n<!-- beta -->\nUkryte\n<!-- /beta -->\nPo')).toEqual([
      { type: 'paragraph', children: [text('Przed')] },
      { type: 'paragraph', children: [text('Po')] },
    ]);
  });

  it('nests blocks, and an unclosed block ends with the document', () => {
    const doc =
      '<!-- ads -->\nA\n<!-- ads-limited -->\nB\n<!-- /ads-limited -->\n<!-- ads-cookies -->\nC';
    expect(
      parseMarkdownLite(doc, { flags: { ads: true, 'ads-limited': true, 'ads-cookies': false } }),
    ).toEqual([
      {
        type: 'section',
        name: 'ads',
        children: [
          { type: 'paragraph', children: [text('A')] },
          {
            type: 'section',
            name: 'ads-limited',
            children: [{ type: 'paragraph', children: [text('B')] }],
          },
        ],
      },
    ]);
    // The outer flag off hides the inner block too.
    expect(parseMarkdownLite(doc, { flags: { ads: false, 'ads-limited': true } })).toEqual([]);
  });
});

describe('parseInline', () => {
  it('parses bold, code and safe links', () => {
    expect(
      parseInline(
        '**Bez kont**, `localStorage` i [wróć](/) lub [Google](https://policies.google.com/x)',
      ),
    ).toEqual([
      { type: 'bold', children: [text('Bez kont')] },
      text(', '),
      { type: 'code', text: 'localStorage' },
      text(' i '),
      { type: 'link', href: '/', children: [text('wróć')] },
      text(' lub '),
      { type: 'link', href: 'https://policies.google.com/x', children: [text('Google')] },
    ]);
  });

  it('keeps <script> as plain text (renderers escape it)', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([text('<script>alert(1)</script>')]);
  });

  it('drops javascript:, data:, http: and protocol-relative links but keeps their text', () => {
    for (const href of [
      'javascript:alert%281%29',
      'data:text/html,x',
      'http://example.org',
      '//evil.example',
      '/\\evil.example',
      'JAVASCRIPT:alert%281%29',
    ]) {
      expect(parseInline(`[kliknij](${href}) tu`)).toEqual([text('kliknij tu')]);
    }
    // The url ends at the first ')', so a call in it leaves only text, never a link.
    expect(parseInline('[x](javascript:alert(1))')).toEqual([text('x)')]);
  });

  it('fills variables from vars, or from the fallback when unset or blank', () => {
    const doc = 'Administrator: {{operator.name|[do uzupełnienia]}}.';
    expect(parseInline(doc, { vars: { 'operator.name': 'Szkoła nr 1' } })).toEqual([
      text('Administrator: Szkoła nr 1.'),
    ]);
    expect(parseInline(doc, { vars: { 'operator.name': '  ' } })).toEqual([
      text('Administrator: [do uzupełnienia].'),
    ]);
    expect(parseInline(doc)).toEqual([text('Administrator: [do uzupełnienia].')]);
    expect(parseInline('a{{missing}}b')).toEqual([text('ab')]);
  });

  it('never interprets markup inside a variable value', () => {
    expect(parseInline('{{x|-}}', { vars: { x: '**[a](javascript:b)** <i>' } })).toEqual([
      text('**[a](javascript:b)** <i>'),
    ]);
  });

  it('gives the plain text of nested inline content', () => {
    expect(inlineText(parseInline('**[A](/) `b`** c'))).toBe('A b c');
  });
});

describe('helpers', () => {
  it('isSafeHref allows https and same-site paths only', () => {
    expect(isSafeHref('https://drkp.dev/')).toBe(true);
    expect(isSafeHref('/prywatnosc')).toBe(true);
    expect(isSafeHref('/')).toBe(true);
    expect(isSafeHref('mailto:a@b.pl')).toBe(false);
    expect(isSafeHref('https://a b')).toBe(false);
  });

  it('splitTableRow keeps pipes inside variables and code', () => {
    expect(splitTableRow('| {{operator.name|brak}} | `a|b` | c |')).toEqual([
      '{{operator.name|brak}}',
      '`a|b`',
      'c',
    ]);
  });
});
