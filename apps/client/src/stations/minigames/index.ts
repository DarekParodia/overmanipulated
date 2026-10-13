// Minigame per station kind. The registry is complete (S7-56): a station kind without its
// minigame is a compile error, so no placeholder stand-in exists.
// imageSearch: S2-04, archive: S2-05, sourceRegistry: S2-06, phone: S4-01, aiScanner: S4-02,
// dataLibrary: S4-03, metadata: S7-52, transcript: S7-53, crossCheck: S7-54, geolocation: S7-55.

import type { StationKind } from '@redakcja/shared';
import { AiScanner } from './AiScanner.tsx';
import { Archive } from './Archive.tsx';
import { CrossCheck } from './CrossCheck.tsx';
import { DataLibrary } from './DataLibrary.tsx';
import { Geolocation } from './Geolocation.tsx';
import { ImageSearch } from './ImageSearch.tsx';
import { Metadata } from './Metadata.tsx';
import { Phone } from './Phone.tsx';
import { SourceRegistry } from './SourceRegistry.tsx';
import { Transcript } from './Transcript.tsx';
import type { Minigame, MinigameRegistry } from './types.ts';

export type { Minigame, MinigameProps } from './types.ts';

export const minigames: MinigameRegistry = {
  imageSearch: ImageSearch,
  archive: Archive,
  sourceRegistry: SourceRegistry,
  phone: Phone,
  aiScanner: AiScanner,
  dataLibrary: DataLibrary,
  metadata: Metadata,
  transcript: Transcript,
  crossCheck: CrossCheck,
  geolocation: Geolocation,
};

export function minigameFor(kind: StationKind): Minigame {
  return minigames[kind];
}
