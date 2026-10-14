import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_FEATURE_FLAGS, type PublicAds, parseMarkdownLite } from '@redakcja/shared';
import { parseConfigValue } from '../config.ts';
import { DEFAULT_PRIVACY_MD_PATH } from '../paths.ts';
import { blocksHtml, privacyFlags, privacyVars, renderPrivacyPage } from './privacy-page.ts';

const NOTE = readFileSync(DEFAULT_PRIVACY_MD_PATH, 'utf8');

const ADS_OFF: PublicAds = { enabled: false };
const LIMITED_TEEN: PublicAds = {
  enabled: true,
  mode: 'limited',
  client: 'ca-pub-1234567890123456',
  slots: {},
  ageTreatment: 'teen',
};
const ADULTS: PublicAds = { ...LIMITED_TEEN, mode: 'nonPersonalized', ageTreatment: 'unspecified' };

const ROOM_BROWSER_ON = { ...DEFAULT_FEATURE_FLAGS, roomBrowser: true };

function page(
  ads: PublicAds,
  vars: Record<string, string | undefined> = {},
  features = DEFAULT_FEATURE_FLAGS,
): string {
  return renderPrivacyPage(NOTE, { vars, flags: privacyFlags({ ads, features }) });
}

describe('privacyFlags', () => {
  it('maps the public ads decision to the note blocks', () => {
    const features = DEFAULT_FEATURE_FLAGS;
    expect(privacyFlags({ ads: ADS_OFF, features })).toEqual({
      ads: false,
      'no-ads': true,
      'ads-limited': false,
      'ads-minors': false,
      'ads-cookies': false,
      'room-browser': false,
      'no-room-browser': true,
    });
    expect(privacyFlags({ ads: LIMITED_TEEN, features })).toEqual({
      ads: true,
      'no-ads': false,
      'ads-limited': true,
      'ads-minors': true,
      'ads-cookies': false,
      'room-browser': false,
      'no-room-browser': true,
    });
    expect(privacyFlags({ ads: ADULTS, features })).toEqual({
      ads: true,
      'no-ads': false,
      'ads-limited': false,
      'ads-minors': false,
      'ads-cookies': true,
      'room-browser': false,
      'no-room-browser': true,
    });
  });

  it('maps the room-browser flag to its blocks (S7-93)', () => {
    expect(privacyFlags({ ads: ADS_OFF, features: ROOM_BROWSER_ON })).toMatchObject({
      'room-browser': true,
      'no-room-browser': false,
    });
  });
});

describe('privacyVars', () => {
  it('takes the operator lines and the public origin from config.json', () => {
    const parsed = parseConfigValue({
      site: {
        publicOrigin: 'https://bronsie.drkp.dev',
        operator: { name: 'XIV LO', contact: 'gra@xiv.example' },
      },
    });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(privacyVars(parsed.config)).toEqual({
      'operator.name': 'XIV LO',
      'operator.contact': 'gra@xiv.example',
      'operator.hosting': undefined,
      'site.origin': 'https://bronsie.drkp.dev',
    });
  });
});

describe('blocksHtml', () => {
  it('escapes text, code and link targets, and marks links to other sites', () => {
    const blocks = parseMarkdownLite(
      '# A & B\n\n`<b>` [x](https://a.example/?q="1"&r) [y](/)\n\n| h |\n| --- |\n| <i> |',
    );
    expect(blocksHtml(blocks)).toBe(
      [
        '<h1>A &amp; B</h1>',
        '<p><code>&lt;b&gt;</code> <a href="https://a.example/?q=&quot;1&quot;&amp;r" rel="noopener noreferrer">x</a> <a href="/">y</a></p>',
        '<div class="table"><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>&lt;i&gt;</td></tr></tbody></table></div>',
      ].join('\n'),
    );
  });
});

describe('the privacy note (docs/privacy.pl.md)', () => {
  it('has a title, a way back to the game and no unrendered syntax', () => {
    for (const ads of [ADS_OFF, LIMITED_TEEN, ADULTS]) {
      const html = page(ads);
      expect(html).toContain('<title>Prywatność w grze „Redakcja na Ostatnią Chwilę”</title>');
      expect(html).toContain('<a href="/">← Wróć do gry</a>');
      expect(html).not.toMatch(/\{\{|\}\}|<!--|-->|\*\*|\]\(/);
      expect(html).not.toContain('<script');
      // A stray `<!-- word -->` would open a block and swallow the rest of the note.
      expect(html).toContain('<h2>Uwaga dla nauczyciela</h2>');
    }
  });

  it('without ads says so and has no ads section', () => {
    const html = page(ADS_OFF);
    expect(html).toContain('<div data-block="no-ads">');
    expect(html).not.toContain('data-block="ads');
    expect(html).not.toContain('<h2>Reklamy</h2>');
    expect(html).not.toContain('Google');
  });

  it('with limited ads describes them, the consent window and the revocation link', () => {
    const html = page(LIMITED_TEEN);
    expect(html).not.toContain('data-block="no-ads"');
    expect(html).toContain('<h2>Reklamy</h2>');
    expect(html).toContain('<div data-block="ads-limited">');
    expect(html).toContain('<div data-block="ads-minors">');
    expect(html).not.toContain('data-block="ads-cookies"');
    expect(html).toContain('bez ciasteczek reklamowych');
    expect(html).toContain('„Zgody reklamowe”');
    expect(html).toContain(
      '<a href="https://policies.google.com/technologies/partner-sites" rel="noopener noreferrer">',
    );
  });

  it('with non-personalised ads for adults names their cookies instead', () => {
    const html = page(ADULTS);
    expect(html).toContain('<div data-block="ads-cookies">');
    expect(html).not.toContain('data-block="ads-limited"');
    expect(html).not.toContain('data-block="ads-minors"');
  });

  it('describes private rooms, the Widownia and the kick cooldown on every server (S7-93)', () => {
    const html = page(ADS_OFF);
    expect(html).toContain('<h2>Pokoje, lista pokoi i Widownia</h2>');
    expect(html).toContain('Każdy pokój jest <strong>prywatny</strong>');
    expect(html).toContain('<strong>Widownia.</strong> Gospodarz może otworzyć Widownię');
    expect(html).toContain('przez 10 minut, tylko dla tego pokoju i tylko w pamięci');
    expect(html).toContain('Gra nie blokuje adresów IP');
  });

  it('says what the public room list shows only where the server has one (S7-93)', () => {
    const off = page(ADS_OFF);
    expect(off).toContain('<div data-block="no-room-browser">');
    expect(off).toContain('<strong>lista publicznych pokoi jest wyłączona</strong>');
    expect(off).not.toContain('data-block="room-browser"');

    const on = page(ADS_OFF, {}, ROOM_BROWSER_ON);
    expect(on).toContain('<div data-block="room-browser">');
    expect(on).not.toContain('no-room-browser');
    expect(on).toContain(
      'kod pokoju, nazwę pokoju, podpis gospodarza, poziom, tryb gry, poziom trudności, liczbę graczy i widzów',
    );
    expect(on).toContain('Podpisów pozostałych graczy lista nie pokazuje.');
  });

  it('fills the operator lines, with visible placeholders until they are set', () => {
    expect(page(ADS_OFF)).toContain(
      'Administrator serwera: <strong>[do uzupełnienia: imię i nazwisko, szkoła lub organizacja]</strong>.',
    );
    const html = page(ADS_OFF, {
      'operator.name': 'XIV LO w Nowych Brzegach',
      'operator.contact': 'gra@xiv.example',
      'operator.hosting': 'Polska, VPS',
    });
    expect(html).toContain('Administrator serwera: <strong>XIV LO w Nowych Brzegach</strong>.');
    expect(html).toContain('Kontakt: gra@xiv.example.');
    expect(html).toContain('Serwer: Polska, VPS. Połączenie');
    expect(html).not.toContain('do uzupełnienia');
  });
});
