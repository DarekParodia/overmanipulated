// Stand-in until a station's real minigame lands: one button that succeeds.
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import type { MinigameProps } from './types.ts';

export function PlaceholderMinigame({ story, onDone }: MinigameProps) {
  return (
    <div>
      <p>{story.headline}</p>
      <Button variant="primary" onClick={() => onDone(true)}>
        {pl.vocab.verdicts.publish}
      </Button>
    </div>
  );
}
