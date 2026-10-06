// localStorage/sessionStorage can be missing or throw (private mode, blocked site data).
// Everything persisted on the client goes through these helpers and degrades to memory.

type Kind = 'local' | 'session';

function storage(kind: Kind): Storage | null {
  try {
    return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
  } catch {
    return null;
  }
}

export function readStored(kind: Kind, key: string): string | null {
  try {
    return storage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(kind: Kind, key: string, value: string | null): void {
  try {
    const target = storage(kind);
    if (value === null) {
      target?.removeItem(key);
    } else {
      target?.setItem(key, value);
    }
  } catch {
    // Ignore: persistence is a convenience, never required.
  }
}
