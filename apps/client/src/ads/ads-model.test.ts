import { describe, expect, it } from 'bun:test';
import type { PublicAds } from '@redakcja/shared';
import type { ScreenId } from '../store/app.ts';
import {
  AD_QUEUE_FLAGS,
  adEligible,
  adRequestAttributes,
  loaderUrl,
  slotFor,
} from './ads-model.ts';
import { AD_MIN_GAP_PX, AD_PLACEMENTS, ADS_LOAD_TIMEOUT_MS } from './placements.ts';

const ADS_ON: PublicAds = {
  enabled: true,
  mode: 'limited',
  client: 'ca-pub-1234567890123456',
  slots: { menu: '1234567890', lobby: '2345678901' },
  ageTreatment: 'teen',
};

describe('adEligible', () => {
  const table: Array<[ScreenId, boolean, boolean, boolean]> = [
    // screen, levelEnded, spectating, eligible
    ['mainMenu', false, false, true],
    ['lobby', false, false, true],
    ['briefing', false, false, false],
    ['styleguide', false, false, false],
    ['game', false, false, false],
    ['game', true, false, true],
    ['game', false, true, true],
    ['game', true, true, true],
    ['briefing', true, true, false],
  ];
  for (const [screen, levelEnded, spectating, eligible] of table) {
    it(`${screen} (levelEnded ${levelEnded}, spectating ${spectating}) → ${eligible}`, () => {
      expect(adEligible({ screen, levelEnded, spectating })).toBe(eligible);
    });
  }
});

describe('slotFor', () => {
  it('returns the ad unit of a configured placement', () => {
    expect(slotFor(ADS_ON, 'menu')).toBe('1234567890');
    expect(slotFor(ADS_ON, 'lobby')).toBe('2345678901');
  });

  it('returns null for a placement without a unit or with ads off', () => {
    expect(slotFor(ADS_ON, 'results')).toBeNull();
    expect(slotFor({ enabled: false }, 'menu')).toBeNull();
  });
});

describe('ad request flags', () => {
  it('asks for non-personalised ads and starts unpaused', () => {
    expect(AD_QUEUE_FLAGS).toEqual({ requestNonPersonalizedAds: 1, pauseAdRequests: 0 });
  });

  it('tags limited-mode teen requests as under the age of consent with the teen age treatment', () => {
    expect(adRequestAttributes('limited', 'teen')).toEqual({
      'data-tag-for-age-treatment': '2',
      'data-tag-for-under-age-of-consent': '1',
    });
  });

  it('uses 1 for children and no age tag for unspecified', () => {
    expect(adRequestAttributes('limited', 'child')).toEqual({
      'data-tag-for-age-treatment': '1',
      'data-tag-for-under-age-of-consent': '1',
    });
    expect(adRequestAttributes('limited', 'unspecified')).toEqual({
      'data-tag-for-under-age-of-consent': '1',
    });
  });

  it('sends no under-age tag for adult non-personalised ads', () => {
    expect(adRequestAttributes('nonPersonalized', 'unspecified')).toEqual({});
  });

  it('builds the loader URL for the publisher id', () => {
    expect(loaderUrl('ca-pub-1234567890123456')).toBe(
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1234567890123456',
    );
  });
});

describe('placements', () => {
  it('keeps the policy gap and load timeout', () => {
    expect(AD_MIN_GAP_PX).toBe(150);
    expect(ADS_LOAD_TIMEOUT_MS).toBe(8000);
  });

  it('never targets a phone-sized viewport', () => {
    for (const { query } of Object.values(AD_PLACEMENTS)) {
      const minWidth = Number(/min-width: (\d+)px/.exec(query)?.[1]);
      const minHeight = Number(/min-height: (\d+)px/.exec(query)?.[1]);
      // PHONE_QUERY: max-height 500px or max-width 760px.
      expect(minWidth).toBeGreaterThan(760);
      expect(minHeight).toBeGreaterThan(500);
    }
  });

  it('uses the fixed AdSense unit sizes', () => {
    expect(AD_PLACEMENTS.menu.size).toEqual({ width: 160, height: 600 });
    expect(AD_PLACEMENTS.lobby.size).toEqual({ width: 728, height: 90 });
    expect(AD_PLACEMENTS.results.size).toEqual({ width: 160, height: 600 });
    expect(AD_PLACEMENTS.spectator.size).toEqual({ width: 728, height: 90 });
  });
});
