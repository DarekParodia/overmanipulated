import { describe, expect, it } from 'bun:test';
import { MOTD_MAX_CHARS } from './constants.ts';
import { CSP_NONCE_PLACEHOLDER } from './csp-nonce.ts';
import {
  AD_PLACEMENTS,
  adModeAllowed,
  DEFAULT_AD_AGE_TREATMENT,
  DEFAULT_AD_MODE,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_PUBLIC_CONFIG,
  FEATURE_FLAGS,
  featureFlagsSchema,
  hostAllowed,
  hostnameSchema,
  motdSchema,
  normalizeHost,
  PUBLIC_CONFIG_ELEMENT_ID,
  type PublicConfig,
  publicAdsSchema,
  publicConfigSchema,
} from './public-config.ts';

const ADS_ON = {
  enabled: true,
  mode: 'limited',
  client: 'ca-pub-1234567890123456',
  slots: { menu: '1111111111', lobby: '2222222222' },
  ageTreatment: 'teen',
} as const;

function issuePaths(result: { error?: { issues: { path: PropertyKey[] }[] } }): string[] {
  return (result.error?.issues ?? []).map((issue) => issue.path.join('.'));
}

describe('DEFAULT_PUBLIC_CONFIG', () => {
  it('parses with the room browser off and every other flag on', () => {
    expect(publicConfigSchema.parse(DEFAULT_PUBLIC_CONFIG)).toEqual({
      revision: 0,
      siteOrigin: null,
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
      defaultDifficulty: 'normal',
      motd: null,
      ads: { enabled: false },
    });
  });

  it('keeps the shared defaults frozen', () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      roomBrowser: false,
      versus: true,
      spectators: true,
      intro: true,
    });
    expect(Object.isFrozen(DEFAULT_FEATURE_FLAGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PUBLIC_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_PUBLIC_CONFIG.ads)).toBe(true);
  });

  it('names the embedded element and the nonce placeholder', () => {
    expect(PUBLIC_CONFIG_ELEMENT_ID).toBe('redakcja-config');
    expect(CSP_NONCE_PLACEHOLDER).toBe('__REDAKCJA_CSP_NONCE__');
  });
});

describe('feature flags', () => {
  it('lists the four flags, each in the flags object', () => {
    expect(FEATURE_FLAGS).toEqual(['roomBrowser', 'versus', 'spectators', 'intro']);
    expect(Object.keys(featureFlagsSchema.shape)).toEqual([...FEATURE_FLAGS]);
  });

  it('rejects a missing flag and strips an unknown one', () => {
    expect(
      featureFlagsSchema.safeParse({ versus: true, spectators: true, intro: true }).success,
    ).toBe(false);
    expect(featureFlagsSchema.parse({ ...DEFAULT_FEATURE_FLAGS, teleports: true })).toEqual({
      roomBrowser: false,
      versus: true,
      spectators: true,
      intro: true,
    });
  });
});

describe('publicAdsSchema', () => {
  it('accepts disabled ads with nothing else', () => {
    expect(publicAdsSchema.parse({ enabled: false })).toEqual({ enabled: false });
  });

  it('rejects enabled ads without a client', () => {
    const { client: _client, ...noClient } = ADS_ON;
    const result = publicAdsSchema.safeParse(noClient);
    expect(result.success).toBe(false);
    expect(issuePaths(result)).toEqual(['client']);
  });

  it('accepts limited ads for teenagers with partial slots', () => {
    expect(publicAdsSchema.parse(ADS_ON)).toEqual({
      enabled: true,
      mode: 'limited',
      client: 'ca-pub-1234567890123456',
      slots: { menu: '1111111111', lobby: '2222222222' },
      ageTreatment: 'teen',
    });
    expect(publicAdsSchema.parse({ ...ADS_ON, slots: {} }).enabled).toBe(true);
  });

  it('rejects a non-limited mode with teen or child', () => {
    for (const ageTreatment of ['teen', 'child'] as const) {
      const result = publicAdsSchema.safeParse({
        ...ADS_ON,
        mode: 'nonPersonalized',
        ageTreatment,
      });
      expect(result.success).toBe(false);
      expect(issuePaths(result)).toEqual(['mode']);
    }
  });

  it('accepts non-personalised ads only for an unspecified audience', () => {
    const ads = { ...ADS_ON, mode: 'nonPersonalized', ageTreatment: 'unspecified' };
    expect(publicAdsSchema.safeParse(ads).success).toBe(true);
  });

  it('never accepts personalised ads', () => {
    for (const ageTreatment of ['teen', 'child', 'unspecified'] as const) {
      const ads = { ...ADS_ON, mode: 'personalized', ageTreatment };
      expect(publicAdsSchema.safeParse(ads).success).toBe(false);
    }
  });

  it('rejects a malformed client, slot id or placement', () => {
    expect(publicAdsSchema.safeParse({ ...ADS_ON, client: 'pub-1234567890123456' }).success).toBe(
      false,
    );
    expect(publicAdsSchema.safeParse({ ...ADS_ON, slots: { menu: 'abc' } }).success).toBe(false);
    expect(publicAdsSchema.safeParse({ ...ADS_ON, slots: { game: '1111111111' } }).success).toBe(
      false,
    );
  });

  it('defaults to limited ads tagged for teenagers', () => {
    expect(DEFAULT_AD_MODE).toBe('limited');
    expect(DEFAULT_AD_AGE_TREATMENT).toBe('teen');
    expect(AD_PLACEMENTS).toEqual(['menu', 'lobby', 'results', 'spectator']);
  });
});

describe('adModeAllowed', () => {
  it('allows limited ads for every audience and non-personalised ads for adults only', () => {
    expect(adModeAllowed('limited', 'child')).toBe(true);
    expect(adModeAllowed('limited', 'teen')).toBe(true);
    expect(adModeAllowed('limited', 'unspecified')).toBe(true);
    expect(adModeAllowed('nonPersonalized', 'child')).toBe(false);
    expect(adModeAllowed('nonPersonalized', 'teen')).toBe(false);
    expect(adModeAllowed('nonPersonalized', 'unspecified')).toBe(true);
  });
});

describe('motdSchema', () => {
  const motd = { id: 'konkurs-2026.10', text: 'Serwer będzie wyłączony o 22:00.', tone: 'info' };

  it('accepts 140 characters and rejects 141', () => {
    expect(MOTD_MAX_CHARS).toBe(140);
    expect(motdSchema.safeParse({ ...motd, text: 'a'.repeat(140) }).success).toBe(true);
    expect(motdSchema.safeParse({ ...motd, text: 'a'.repeat(141) }).success).toBe(false);
  });

  it('trims the text and rejects an empty one or a control character', () => {
    expect(motdSchema.parse({ ...motd, text: '  Witajcie!  ' }).text).toBe('Witajcie!');
    expect(motdSchema.safeParse({ ...motd, text: '   ' }).success).toBe(false);
    expect(motdSchema.safeParse({ ...motd, text: 'Dwie\nlinie' }).success).toBe(false);
    expect(motdSchema.safeParse({ ...motd, text: 'Dwie linie' }).success).toBe(false);
    expect(motdSchema.safeParse({ ...motd, text: 'Dwa akapity' }).success).toBe(false);
  });

  it('rejects an id with spaces or over 40 characters and an unknown tone', () => {
    expect(motdSchema.safeParse({ ...motd, id: 'nowy komunikat' }).success).toBe(false);
    expect(motdSchema.safeParse({ ...motd, id: 'a'.repeat(41) }).success).toBe(false);
    expect(motdSchema.safeParse({ ...motd, tone: 'danger' }).success).toBe(false);
  });
});

describe('publicConfigSchema', () => {
  it('parses a full config with ads, a message and an origin', () => {
    const config: PublicConfig = {
      revision: 3,
      siteOrigin: 'https://bronsie.drkp.dev',
      features: { roomBrowser: true, versus: false, spectators: true, intro: true },
      defaultDifficulty: 'hard',
      motd: { id: 'm1', text: 'Nowe poziomy!', tone: 'warning' },
      ads: ADS_ON,
    };
    expect(publicConfigSchema.parse(config)).toEqual(config);
  });

  it('rejects a non-http origin, a negative revision and an unknown difficulty', () => {
    const base = { ...DEFAULT_PUBLIC_CONFIG };
    expect(
      publicConfigSchema.safeParse({ ...base, siteOrigin: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(publicConfigSchema.safeParse({ ...base, revision: -1 }).success).toBe(false);
    expect(publicConfigSchema.safeParse({ ...base, defaultDifficulty: 'insane' }).success).toBe(
      false,
    );
  });

  it('reduces the site origin to scheme, host and port', () => {
    const originOf = (siteOrigin: string) =>
      publicConfigSchema.parse({ ...DEFAULT_PUBLIC_CONFIG, siteOrigin }).siteOrigin;
    expect(originOf('https://Bronsie.drkp.dev/')).toBe('https://bronsie.drkp.dev');
    expect(originOf('https://bronsie.drkp.dev/gra?x=1')).toBe('https://bronsie.drkp.dev');
    expect(originOf('https://bronsie.drkp.dev:443')).toBe('https://bronsie.drkp.dev');
    expect(originOf('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(
      publicConfigSchema.safeParse({ ...DEFAULT_PUBLIC_CONFIG, siteOrigin: 'nie url' }).success,
    ).toBe(false);
  });

  it('strips keys a newer server adds', () => {
    expect(publicConfigSchema.parse({ ...DEFAULT_PUBLIC_CONFIG, theme: 'night' })).toEqual({
      revision: 0,
      siteOrigin: null,
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
      defaultDifficulty: 'normal',
      motd: null,
      ads: { enabled: false },
    });
  });
});

describe('normalizeHost', () => {
  it('drops the port and lower-cases', () => {
    expect(normalizeHost('BRONSIE.drkp.dev:443')).toBe('bronsie.drkp.dev');
    expect(normalizeHost('  localhost:5173 ')).toBe('localhost');
    expect(normalizeHost('127.0.0.1:3000')).toBe('127.0.0.1');
  });

  it('unwraps an IPv6 literal', () => {
    expect(normalizeHost('[::1]:3000')).toBe('::1');
    expect(normalizeHost('[::1]')).toBe('::1');
    expect(normalizeHost('[2001:DB8::1]:443')).toBe('2001:db8::1');
    expect(normalizeHost('[::1')).toBeNull();
    expect(normalizeHost('[]')).toBeNull();
    expect(normalizeHost('[::1]x')).toBeNull();
    expect(normalizeHost('[::1]:abc')).toBeNull();
  });

  it('keeps a bare IPv6 literal whole', () => {
    expect(normalizeHost('::1')).toBe('::1');
    expect(normalizeHost('2001:db8::1')).toBe('2001:db8::1');
  });

  it('drops a trailing dot', () => {
    expect(normalizeHost('drkp.dev.')).toBe('drkp.dev');
    expect(normalizeHost('drkp.dev.:443')).toBe('drkp.dev');
  });

  it('returns null for nothing', () => {
    expect(normalizeHost('')).toBeNull();
    expect(normalizeHost('   ')).toBeNull();
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });
});

describe('hostAllowed', () => {
  it('matches exact hosts only', () => {
    expect(hostAllowed('drkp.dev', ['bronsie.drkp.dev'])).toBe(false);
    expect(hostAllowed('bronsie.drkp.dev', ['drkp.dev'])).toBe(false);
    expect(hostAllowed('bronsie.drkp.dev', ['drkp.dev', 'bronsie.drkp.dev'])).toBe(true);
    expect(hostAllowed('evil-drkp.dev', ['drkp.dev'])).toBe(false);
  });

  it('never allows an unknown host', () => {
    expect(hostAllowed(null, ['bronsie.drkp.dev'])).toBe(false);
    expect(hostAllowed('bronsie.drkp.dev', [])).toBe(false);
  });
});

describe('hostnameSchema', () => {
  it('trims and lower-cases a host name', () => {
    expect(hostnameSchema.parse(' Bronsie.DRKP.dev ')).toBe('bronsie.drkp.dev');
    expect(hostnameSchema.parse('localhost')).toBe('localhost');
  });

  it('rejects a scheme, a port, a wildcard and malformed labels', () => {
    for (const bad of [
      'https://drkp.dev',
      'drkp.dev:443',
      '*.drkp.dev',
      'a..b',
      '-drkp.dev',
      'drkp-.dev',
      'bad_host.dev',
      '',
      `${'a'.repeat(64)}.dev`,
    ]) {
      expect(hostnameSchema.safeParse(bad).success).toBe(false);
    }
  });
});
