import { describe, expect, it } from 'bun:test';
import { CSP_NONCE_PLACEHOLDER, DEFAULT_PUBLIC_CONFIG, type PublicConfig } from '@redakcja/shared';
import { createNonce, escapeAttribute, jsonForHtml, renderShell } from './render-shell.ts';

const P = CSP_NONCE_PLACEHOLDER;
const TEMPLATE = `<!doctype html><html><head><meta property="csp-nonce" nonce="${P}"><script type="module" src="/assets/index-AAAAAAAA.js" nonce="${P}"></script><link rel="stylesheet" href="/assets/index-BBBBBBBB.css" nonce="${P}"></head><body><div id="root"></div></body></html>`;

const MOTD_CONFIG: PublicConfig = {
  ...DEFAULT_PUBLIC_CONFIG,
  motd: { id: 'm1', text: 'Uwaga </script><script>alert(1)</script> \u2028 <!--', tone: 'info' },
};

function embeddedJson(html: string): string {
  const match = /<script id="redakcja-config" type="application\/json">(.*?)<\/script>/s.exec(html);
  if (!match?.[1]) throw new Error('no embedded config');
  return match[1];
}

describe('createNonce', () => {
  it('is 24 base64 characters for 16 bytes', () => {
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce((b) => b.fill(0))).toBe('AAAAAAAAAAAAAAAAAAAAAA==');
  });

  it('differs between calls', () => {
    expect(createNonce()).not.toBe(createNonce());
  });
});

describe('jsonForHtml', () => {
  it('escapes <, U+2028 and U+2029 and stays valid JSON', () => {
    const value = { text: '</script>\u2028\u2029<!--' };
    const json = jsonForHtml(value);
    expect(json).toBe('{"text":"\\u003c/script>\\u2028\\u2029\\u003c!--"}');
    expect(JSON.parse(json)).toEqual(value);
  });
});

describe('escapeAttribute', () => {
  it('escapes the five HTML-special characters', () => {
    expect(escapeAttribute(`a&b"c<d>e'f`)).toBe('a&amp;b&quot;c&lt;d&gt;e&#39;f');
  });
});

describe('renderShell', () => {
  it('replaces all three placeholders with the nonce', () => {
    const html = renderShell(TEMPLATE, {
      nonce: 'NONCE123',
      publicConfig: DEFAULT_PUBLIC_CONFIG,
      adsAccount: null,
    });
    expect(html).not.toContain(P);
    expect(html.match(/nonce="NONCE123"/g)?.length).toBe(3);
  });

  it('embeds the public config before </head>', () => {
    const html = renderShell(TEMPLATE, {
      nonce: 'n',
      publicConfig: DEFAULT_PUBLIC_CONFIG,
      adsAccount: null,
    });
    expect(JSON.parse(embeddedJson(html))).toEqual(DEFAULT_PUBLIC_CONFIG);
    expect(html.indexOf('id="redakcja-config"')).toBeLessThan(html.indexOf('</head>'));
  });

  it('adds the verification meta tag only with an ads account', () => {
    const without = renderShell(TEMPLATE, {
      nonce: 'n',
      publicConfig: DEFAULT_PUBLIC_CONFIG,
      adsAccount: null,
    });
    const withMeta = renderShell(TEMPLATE, {
      nonce: 'n',
      publicConfig: DEFAULT_PUBLIC_CONFIG,
      adsAccount: 'ca-pub-1234567890123456',
    });
    expect(without).not.toContain('google-adsense-account');
    expect(withMeta).toContain(
      '<meta name="google-adsense-account" content="ca-pub-1234567890123456">',
    );
  });

  it('a MOTD with </script> round-trips and never closes the element', () => {
    const html = renderShell(TEMPLATE, { nonce: 'n', publicConfig: MOTD_CONFIG, adsAccount: null });
    expect(html).not.toContain('</script><script>');
    expect(html).not.toContain('<!--');
    expect(JSON.parse(embeddedJson(html))).toEqual(MOTD_CONFIG);
  });

  it('never turns operator text that contains the placeholder into the nonce', () => {
    const config: PublicConfig = {
      ...DEFAULT_PUBLIC_CONFIG,
      motd: { id: 'm2', text: `tekst ${P}`, tone: 'warning' },
    };
    const html = renderShell(TEMPLATE, { nonce: 'SECRET', publicConfig: config, adsAccount: null });
    expect(JSON.parse(embeddedJson(html)).motd.text).toBe(`tekst ${P}`);
  });

  it('refuses a template without </head>', () => {
    expect(() =>
      renderShell('<div id="root"></div>', {
        nonce: 'n',
        publicConfig: DEFAULT_PUBLIC_CONFIG,
        adsAccount: null,
      }),
    ).toThrow('</head>');
  });
});
