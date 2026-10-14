import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { clientIdSchema } from '@redakcja/shared';
import { clientId, generateClientId, resetClientIdCache } from './client-id.ts';

const KEY = 'redakcja.clientId';
let items: Map<string, string>;

beforeEach(() => {
  items = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => items.set(key, value),
      removeItem: (key: string) => items.delete(key),
    },
    configurable: true,
  });
  resetClientIdCache();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage');
  resetClientIdCache();
});

describe('client id (S7-84)', () => {
  it('maps 32 random bytes onto the 64-character id alphabet', () => {
    // Bytes 0, 9, 18, … 279 wrap at 256; each picks the character at byte mod 64.
    const id = generateClientId((bytes) => {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = i * 9;
      }
    });
    expect(id).toBe('AJSbkt2_IRajs1-HQZir09GPYhqz8FOX');
    expect(clientIdSchema.safeParse(id).success).toBe(true);
    expect(generateClientId((bytes) => bytes.fill(255))).toBe('_'.repeat(32));
  });

  it('creates one id, stores it and keeps it across page loads', () => {
    const first = clientId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(items.get(KEY)).toBe(first);
    resetClientIdCache();
    expect(clientId()).toBe(first);
  });

  it('replaces a stored value the wire would refuse', () => {
    items.set(KEY, 'short');
    const id = clientId();
    expect(id).not.toBe('short');
    expect(items.get(KEY)).toBe(id);
  });

  it('keeps a page-only id when storage is missing', () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    const id = clientId();
    expect(clientId()).toBe(id);
    expect(clientIdSchema.safeParse(id).success).toBe(true);
  });
});
