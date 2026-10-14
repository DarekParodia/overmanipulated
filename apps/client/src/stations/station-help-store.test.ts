import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  markStationHelpSeen,
  parseSeenKinds,
  resetStationHelp,
  STATION_HELP_KEY,
  stationHelpSeen,
} from './station-help-store.ts';

/** A Storage stand-in: bun has no localStorage. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('station help store (S7-95)', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: memoryStorage(),
      configurable: true,
    });
  });
  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('reads broken, foreign or unknown values as nothing seen', () => {
    expect(parseSeenKinds(null)).toEqual([]);
    expect(parseSeenKinds('not json')).toEqual([]);
    expect(parseSeenKinds('{"phone":true}')).toEqual([]);
    expect(parseSeenKinds('["phone","teleporter",3,"phone","archive"]')).toEqual([
      'phone',
      'archive',
    ]);
  });

  it('remembers each station once under redakcja.stationHelp.v1', () => {
    expect(STATION_HELP_KEY).toBe('redakcja.stationHelp.v1');
    expect(stationHelpSeen('phone')).toBe(false);
    markStationHelpSeen('phone');
    markStationHelpSeen('metadata');
    markStationHelpSeen('phone');
    expect(stationHelpSeen('phone')).toBe(true);
    expect(stationHelpSeen('archive')).toBe(false);
    expect(localStorage.getItem('redakcja.stationHelp.v1')).toBe('["phone","metadata"]');
  });

  it('shows every card again after the settings reset', () => {
    markStationHelpSeen('imageSearch');
    resetStationHelp();
    expect(stationHelpSeen('imageSearch')).toBe(false);
    expect(localStorage.getItem('redakcja.stationHelp.v1')).toBeNull();
  });
});
