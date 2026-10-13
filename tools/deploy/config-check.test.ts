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
