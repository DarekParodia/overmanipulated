// Minigame per station kind. Stations without an entry use the placeholder.
// imageSearch: S2-04, archive: S2-05, sourceRegistry: S2-06, dataLibrary: S4-03.
import { Archive } from './Archive.tsx';
import { DataLibrary } from './DataLibrary.tsx';
import { ImageSearch } from './ImageSearch.tsx';
import { PlaceholderMinigame } from './Placeholder.tsx';
import { SourceRegistry } from './SourceRegistry.tsx';
import type { Minigame, MinigameRegistry } from './types.ts';

export type { Minigame, MinigameProps } from './types.ts';

export const minigames: MinigameRegistry = {
  imageSearch: ImageSearch,
  archive: Archive,
  sourceRegistry: SourceRegistry,
  dataLibrary: DataLibrary,
};

export function minigameFor(kind: keyof MinigameRegistry): Minigame {
  return minigames[kind] ?? PlaceholderMinigame;
}
