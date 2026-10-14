// The browser's stable client id (S7-84): an opaque random string kept in localStorage and sent
// on every join, so the server's kick cooldown follows a browser rather than the IP a whole class
// shares. It names nothing about the player. Without storage it lives for the page only.
import { clientIdSchema } from '@redakcja/shared';
import { readStored, writeStored } from './safe-storage.ts';

const CLIENT_ID_KEY = 'redakcja.clientId';
/** Characters of a new id: 32 × 6 random bits, inside the wire's 16..64. */
const NEW_ID_LENGTH = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

let cached: string | null = null;

/** A new random id over [A-Za-z0-9_-] from 6 bits of each random byte. */
export function generateClientId(random: (bytes: Uint8Array) => void = fillRandom): string {
  const bytes = new Uint8Array(NEW_ID_LENGTH);
  random(bytes);
  let id = '';
  for (const byte of bytes) {
    id += ALPHABET.charAt(byte % ALPHABET.length);
  }
  return id;
}

function fillRandom(bytes: Uint8Array): void {
  globalThis.crypto.getRandomValues(bytes);
}

/** This browser's id: the stored one when it is still valid, otherwise a new one (then stored). */
export function clientId(): string {
  if (cached !== null) {
    return cached;
  }
  const stored = clientIdSchema.safeParse(readStored('local', CLIENT_ID_KEY));
  if (stored.success) {
    cached = stored.data;
  } else {
    cached = generateClientId();
    writeStored('local', CLIENT_ID_KEY, cached);
  }
  return cached;
}

/** Tests only: forget the id read in this page. */
export function resetClientIdCache(): void {
  cached = null;
}
