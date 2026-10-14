// Styleguide test bench: plays any registered minigame with a sample story and a chosen seed,
// outside a match, so minigames can be built and screenshotted without the full game loop. It
// plays on Normal (the difficulty defaults: full mistake limit, the answer shown on a failure).
// Its clock is the station overlay's (useMinigameClock, S7-95).
import { STORIES } from '@redakcja/content';
import { DEFAULT_DIFFICULTY, type StationKind } from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { attachInput } from '../../input/input-manager.ts';
import { useInputCapture } from '../../input/ui-nav.ts';
import { useApp } from '../../store/app.ts';
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import { useMinigameClock } from '../use-minigame-clock.ts';
import { minigameFor, minigames } from './index.ts';
import { roundRules } from './rules.ts';

export function MinigameBench() {
  const kinds = Object.keys(minigames) as StationKind[];
  const [kind, setKind] = useState<StationKind>(kinds[0] ?? 'imageSearch');
  const [storyIndex, setStoryIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [reporter, setReporter] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const device = useApp((s) => s.inputDevice);
  const story = STORIES[storyIndex % Math.max(STORIES.length, 1)];
  const Game = minigameFor(kind);
  const rules = roundRules(kind, DEFAULT_DIFFICULTY);
  const clock = useMinigameClock(rules.timeLimitMs, result !== null);
  useInputCapture(result === null);
  // Outside a match nothing else listens to the keyboard; the bench needs it for nav intents.
  useEffect(() => attachInput(), []);

  const restart = (next: Partial<{ kind: StationKind; storyIndex: number }>) => {
    if (next.kind) setKind(next.kind);
    if (next.storyIndex !== undefined) setStoryIndex(next.storyIndex);
    setRound((r) => r + 1);
    setResult(null);
    clock.restart();
  };

  if (!story) {
    return null;
  }
  return (
    <div data-testid="minigame-bench">
      <p>
        {kinds.map((k) => (
          <Button key={k} onClick={() => restart({ kind: k })} disabled={k === kind}>
            {pl.vocab.stations[k]}
          </Button>
        ))}
        <Button onClick={() => restart({ storyIndex: storyIndex + 1 })}>{story.id}</Button>
        <Button onClick={() => restart({})}>seed {round}</Button>
        <Button onClick={() => setReporter((r) => !r)} aria-pressed={reporter}>
          {pl.vocab.roles.reporter}
        </Button>
      </p>
      {result === null ? (
        <Game
          key={`${kind}-${story.id}-${round}-${reporter}`}
          seed={round}
          folderId="bench"
          difficulty={rules.difficulty}
          timeLimitMs={rules.timeLimitMs}
          revealOnFail={rules.revealOnFail}
          story={story}
          stamp={story.stamps.find((s) => s.station === kind)}
          device={device}
          skipsQueue={reporter}
          timeUsed={clock.timeUsed}
          onDone={(success) => setResult((r) => r ?? success)}
        />
      ) : (
        <p data-testid="minigame-result">{result ? 'success' : 'failure'}</p>
      )}
    </div>
  );
}
