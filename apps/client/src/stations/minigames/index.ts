// Minigame per station kind. Stations without an entry use the placeholder.
// imageSearch: S2-04, archive: S2-05, sourceRegistry: S2-06, phone: S4-01, aiScanner: S4-02.
import { AiScanner } from './AiScanner.tsx';
import { Archive } from './Archive.tsx';
import { ImageSearch } from './ImageSearch.tsx';
import { Phone } from './Phone.tsx';
import { PlaceholderMinigame } from './Placeholder.tsx';
import { SourceRegistry } from './SourceRegistry.tsx';
import type { Minigame, MinigameRegistry } from './types.ts';

export type { Minigame, MinigameProps } from './types.ts';

export const minigames: MinigameRegistry = {
  imageSearch: ImageSearch,
  archive: Archive,
  sourceRegistry: SourceRegistry,
  phone: Phone,
  aiScanner: AiScanner,
};

export function minigameFor(kind: keyof MinigameRegistry): Minigame {
  return minigames[kind] ?? PlaceholderMinigame;
}
