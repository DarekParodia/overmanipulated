// Minigame placeholder; replaced by the real minigame in its own task (see index.ts).
import { PlaceholderMinigame } from './Placeholder.tsx';
import type { MinigameProps } from './types.ts';

export function SourceRegistry(props: MinigameProps) {
  return <PlaceholderMinigame {...props} />;
}
