// Which stations this browser has seen the help card for (S7-95). The first time a player opens
// a station, the overlay shows its help card; after that only the '?' (H / Select) brings it
// back. Kept in localStorage under `redakcja.stationHelp.v1` as a JSON array of station kinds;
// Settings → Ułatwienia clears it ('Pokaż pomoc stanowisk od nowa').
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { z } from 'zod';
import { readStored, writeStored } from '../store/safe-storage.ts';

export const STATION_HELP_KEY = 'redakcja.stationHelp.v1';

const KNOWN = new Set<string>(STATION_KINDS);

function isStationKind(value: unknown): value is StationKind {
  return typeof value === 'string' && KNOWN.has(value);
}

/** Anything but an array reads as "nothing seen"; unknown or repeated kinds are dropped. */
const seenSchema = z.array(z.unknown()).catch([]);

/** The stored kinds, validated (a broken or foreign value reads as none seen). */
export function parseSeenKinds(raw: string | null): StationKind[] {
  if (raw === null) {
    return [];
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  return [...new Set(seenSchema.parse(data).filter(isStationKind))];
}

/** True once this browser has shown the station's help card. */
export function stationHelpSeen(kind: StationKind): boolean {
  return parseSeenKinds(readStored('local', STATION_HELP_KEY)).includes(kind);
}

/** Remembers that the station's help card was shown. */
export function markStationHelpSeen(kind: StationKind): void {
  const seen = parseSeenKinds(readStored('local', STATION_HELP_KEY));
  if (!seen.includes(kind)) {
    writeStored('local', STATION_HELP_KEY, JSON.stringify([...seen, kind]));
  }
}

/** Every station shows its help card again on its next first use (settings button). */
export function resetStationHelp(): void {
  writeStored('local', STATION_HELP_KEY, null);
}
