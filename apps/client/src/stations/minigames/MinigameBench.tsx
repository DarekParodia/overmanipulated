// Styleguide test bench: plays any registered minigame with a sample story and a chosen seed,
// outside a match, so minigames can be built and screenshotted without the full game loop.
import { STORIES } from '@redakcja/content';
import { MINIGAME_TIME_LIMIT_MS, type StationKind } from '@redakcja/shared';
import { useEffect, useState } from 'react';
import { attachInput } from '../../input/input-manager.ts';
import { useInputCapture } from '../../input/ui-nav.ts';
import { useApp } from '../../store/app.ts';
import { pl } from '../../strings/pl.ts';
import { Button } from '../../ui/Button.tsx';
import { minigameFor, minigames } from './index.ts';

export function MinigameBench() {
  const kinds = Object.keys(minigames) as StationKind[];
  const [kind, setKind] = useState<StationKind>(kinds[0] ?? 'imageSearch');
  const [storyIndex, setStoryIndex] = useState(0);
  const [round, setRound] = useState(1);
  const [reporter, setReporter] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);
  const [startedAt, setStartedAt] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  const device = useApp((s) => s.inputDevice);
  const story = STORIES[storyIndex % Math.max(STORIES.length, 1)];
  const Game = minigameFor(kind);
  useInputCapture(result === null);
  // Outside a match nothing else listens to the keyboard; the bench needs it for nav intents.
  useEffect(() => attachInput(), []);

  useEffect(() => {
    if (result !== null) {
      return;
    }
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, [result]);

  const restart = (next: Partial<{ kind: StationKind; storyIndex: number }>) => {
    if (next.kind) setKind(next.kind);
    if (next.storyIndex !== undefined) setStoryIndex(next.storyIndex);
    setRound((r) => r + 1);
    setResult(null);
    setStartedAt(performance.now());
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
          story={story}
          stamp={story.stamps.find((s) => s.station === kind)}
          device={device}
          skipsQueue={reporter}
          timeUsed={Math.min(1, (now - startedAt) / MINIGAME_TIME_LIMIT_MS)}
          onDone={(success) => setResult((r) => r ?? success)}
        />
      ) : (
        <p data-testid="minigame-result">{result ? 'success' : 'failure'}</p>
      )}
    </div>
  );
}
