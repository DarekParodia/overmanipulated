import { describe, expect, it } from 'bun:test';
import { publicConfigSchema } from '@redakcja/shared';
import { DEFAULT_SERVER_CONFIG, parseConfigValue, type ServerConfig } from './config.ts';
import { activeMotd, adsActiveFor, roomSettings, toPublicConfig } from './public-config.ts';

const ADS_ON = {
  enabled: true,
  client: 'ca-pub-1234567890123456',
  slots: { menu: '1111111111', results: '2222222222' },
  domains: ['bronsie.drkp.dev'],
  signOff: { by: 'Anna Nowak, opiekunka projektu', date: '2026-10-01' },
};

/** 2026-10-13T12:00:00Z */
const NOW = Date.parse('2026-10-13T12:00:00Z');

function config(input: Record<string, unknown>): ServerConfig {
  const parsed = parseConfigValue(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.config;
}

const CTX = { host: 'bronsie.drkp.dev', nowMs: NOW, revision: 0, adsCspReady: true };

describe('toPublicConfig', () => {
  it('derives the defaults: no ads, no message, room browser off', () => {
    const body = toPublicConfig(DEFAULT_SERVER_CONFIG, { ...CTX, host: null });
    expect(body).toEqual({
      revision: 0,
      siteOrigin: null,
      features: { roomBrowser: false, versus: true, spectators: true, intro: true },
      defaultDifficulty: 'normal',
      motd: null,
      ads: { enabled: false },
    });
    expect(publicConfigSchema.safeParse(body).success).toBe(true);
  });

  it('enables ads for a configured host with slots, limited mode and the teen tag', () => {
    const body = toPublicConfig(config({ ads: ADS_ON }), CTX);
    expect(body.ads).toEqual({
      enabled: true,
      mode: 'limited',
      client: 'ca-pub-1234567890123456',
      slots: { menu: '1111111111', results: '2222222222' },
      ageTreatment: 'teen',
    });
    expect(publicConfigSchema.safeParse(body).success).toBe(true);
  });

  it('keeps ads off for a host outside ads.domains, a missing host and a parent domain', () => {
    const cfg = config({ ads: ADS_ON });
    expect(toPublicConfig(cfg, { ...CTX, host: 'localhost' }).ads).toEqual({ enabled: false });
    expect(toPublicConfig(cfg, { ...CTX, host: null }).ads).toEqual({ enabled: false });
    expect(toPublicConfig(cfg, { ...CTX, host: 'drkp.dev' }).ads).toEqual({ enabled: false });
  });

  it('forces ads off when the page cannot carry the ads CSP', () => {
    const body = toPublicConfig(config({ ads: ADS_ON }), { ...CTX, adsCspReady: false });
    expect(body.ads).toEqual({ enabled: false });
  });

  it('never leaks server-only keys', () => {
    const cfg = config({
      site: { publicOrigin: 'https://bronsie.drkp.dev/', operator: { name: 'Szkoła nr 1' } },
      ads: { ...ADS_ON, adsTxt: ['google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0'] },
      csp: { extra: { 'img-src': ['https://example.org'] } },
    });
    const text = JSON.stringify(toPublicConfig(cfg, CTX));
    for (const secret of [
      'signOff',
      'Anna Nowak',
      'adsTxt',
      'f08c47fec0942fa0',
      'domains',
      'example.org',
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('Szkoła');
    expect(toPublicConfig(cfg, CTX).siteOrigin).toBe('https://bronsie.drkp.dev');
  });

  it('passes the revision, feature flags and default difficulty through', () => {
    const cfg = config({
      features: { roomBrowser: true, versus: false },
      rooms: { defaultDifficulty: 'hard' },
    });
    const body = toPublicConfig(cfg, { ...CTX, revision: 7 });
    expect(body.revision).toBe(7);
    expect(body.features).toEqual({
      roomBrowser: true,
      versus: false,
      spectators: true,
      intro: true,
    });
    expect(body.defaultDifficulty).toBe('hard');
  });
});

describe('adsActiveFor', () => {
  it('needs ads on and an exact host match', () => {
    expect(adsActiveFor(config({ ads: ADS_ON }), 'bronsie.drkp.dev')).toBe(true);
    expect(adsActiveFor(config({ ads: ADS_ON }), 'www.bronsie.drkp.dev')).toBe(false);
    expect(adsActiveFor(DEFAULT_SERVER_CONFIG, 'bronsie.drkp.dev')).toBe(false);
    const verificationOnly = config({
      ads: { verification: true, client: ADS_ON.client, domains: ADS_ON.domains },
    });
    expect(adsActiveFor(verificationOnly, 'bronsie.drkp.dev')).toBe(false);
  });
});

describe('activeMotd', () => {
  const motd = {
    id: 'przerwa-2026-10',
    text: 'Przerwa techniczna w piątek o 15:00.',
    tone: 'warning' as const,
  };

  it('shows a message without a window, without from/until', () => {
    expect(activeMotd(config({ motd }).motd, NOW)).toEqual(motd);
  });

  it('drops a message whose until is in the past', () => {
    const cfg = config({ motd: { ...motd, until: '2026-10-13T11:59:59Z' } });
    expect(activeMotd(cfg.motd, NOW)).toBeNull();
    expect(toPublicConfig(cfg, CTX).motd).toBeNull();
  });

  it('drops a message whose from is in the future', () => {
    const cfg = config({ motd: { ...motd, from: '2026-10-13T12:00:01Z' } });
    expect(activeMotd(cfg.motd, NOW)).toBeNull();
  });

  it('shows a message inside its window: from inclusive, until exclusive', () => {
    const cfg = config({
      motd: { ...motd, from: '2026-10-13T12:00:00Z', until: '2026-10-13T12:00:01Z' },
    });
    expect(activeMotd(cfg.motd, NOW)).toEqual(motd);
    expect(activeMotd(cfg.motd, Date.parse('2026-10-13T12:00:01Z'))).toBeNull();
  });

  it('is null without a message', () => {
    expect(activeMotd(null, NOW)).toBeNull();
  });
});

describe('roomSettings', () => {
  it('reads 300 rooms and normal difficulty by default', () => {
    expect(roomSettings(DEFAULT_SERVER_CONFIG).maxRooms).toBe(300);
    expect(roomSettings(DEFAULT_SERVER_CONFIG).defaultDifficulty).toBe('normal');
  });
});
