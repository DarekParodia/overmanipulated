import { describe, expect, it } from 'bun:test';
import { checkConfig } from './config-check.ts';

describe('config:check', () => {
  it('summarises a valid file', () => {
    const result = checkConfig('{"rooms": {"maxRooms": 40}}');
    expect(result.ok).toBe(true);
    expect(result.lines.slice(0, 5)).toEqual([
      'config.json OK',
      'rooms: maxRooms 40, new rooms start on normal',
      'features: roomBrowser off, versus on, spectators on, intro on',
      'motd: none',
      'ads: off',
    ]);
  });

  it('names the sign-off when ads are on', () => {
    const result = checkConfig(
      JSON.stringify({
        ads: {
          enabled: true,
          client: 'ca-pub-1234567890123456',
          slots: { menu: '1111111111' },
          domains: ['bronsie.drkp.dev'],
          signOff: { by: 'Anna Nowak', date: '2026-10-01' },
        },
      }),
    );
    expect(result.lines[4]).toBe(
      'ads: ON (limited, teen) on bronsie.drkp.dev; signed off by Anna Nowak on 2026-10-01',
    );
  });

  it('prints the public config for each ads host and for any other host', () => {
    const result = checkConfig(
      JSON.stringify({
        motd: { id: 'stara', text: 'Wygasło.', until: '2026-10-01T00:00:00Z' },
        ads: {
          enabled: true,
          client: 'ca-pub-1234567890123456',
          slots: { menu: '1111111111' },
          domains: ['bronsie.drkp.dev'],
          signOff: { by: 'Anna Nowak', date: '2026-10-01' },
        },
      }),
      {},
      Date.parse('2026-10-13T12:00:00Z'),
    );
    const features = '{"roomBrowser":false,"versus":true,"spectators":true,"intro":true}';
    expect(result.lines.slice(-2)).toEqual([
      `public config for bronsie.drkp.dev: {"revision":0,"siteOrigin":null,"features":${features},"defaultDifficulty":"normal","motd":null,"ads":{"enabled":true,"mode":"limited","client":"ca-pub-1234567890123456","slots":{"menu":"1111111111"},"ageTreatment":"teen"}}`,
      `public config for any other host: {"revision":0,"siteOrigin":null,"features":${features},"defaultDifficulty":"normal","motd":null,"ads":{"enabled":false}}`,
    ]);
  });

  it('refuses ads without a sign-off, also when ADS_ENABLED=true forces them', () => {
    const result = checkConfig('{"ads": {"client": "ca-pub-1234567890123456"}}', {
      adsEnabled: true,
    });
    expect(result.ok).toBe(false);
    expect(result.lines.join('\n')).toContain('ads.signOff');
  });

  it('reports ADS_ENABLED=false as applied', () => {
    expect(checkConfig('{}', { adsEnabled: false }).lines).toContain(
      'ADS_ENABLED=false from env applied',
    );
  });
});
