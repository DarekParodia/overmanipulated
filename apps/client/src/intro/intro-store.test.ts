import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { INTRO_SEEN_KEY, introSeen, markIntroSeen, resetIntroSeen } from './intro-store.ts';

class MemoryStorage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

describe('intro seen flag', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('starts unseen, is set once seen and can be reset', () => {
    expect(INTRO_SEEN_KEY).toBe('redakcja.intro.seen.v1');
    expect(introSeen()).toBe(false);
    markIntroSeen();
    expect(storage.getItem('redakcja.intro.seen.v1')).toBe('1');
    expect(introSeen()).toBe(true);
    resetIntroSeen();
    expect(introSeen()).toBe(false);
  });

  it('treats any other stored value as unseen', () => {
    storage.setItem('redakcja.intro.seen.v1', 'yes');
    expect(introSeen()).toBe(false);
  });

  it('counts as unseen when storage is blocked', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    expect(introSeen()).toBe(false);
    markIntroSeen();
    expect(introSeen()).toBe(false);
  });
});
