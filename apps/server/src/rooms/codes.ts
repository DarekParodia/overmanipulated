import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@redakcja/shared';

/** Generates a room code not present in `taken`. `random` returns floats in [0, 1). */
export function generateRoomCode(random: () => number, taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!taken.has(code)) {
      return code;
    }
  }
  throw new Error('Could not generate a free room code');
}

/** Cryptographically random float in [0, 1), the default source for room codes. */
export function secureRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 4294967296;
}

/** Unguessable token that lets a disconnected player reclaim their slot. */
export function generateReconnectToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
