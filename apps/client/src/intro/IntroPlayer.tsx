// The intro player (S7-101): the narrated walk-through inside „Jak grać” → Wprowadzenie (and, from
// S7-102, the lobby's first-time autoplay). A stage, an always-on subtitle bar, progress dots and
// four controls: Wstecz, Pauza / Wznów, Dalej (yellow; „Do roboty!” on the last scene) and Pomiń.
//
// The timeline is `introReducer` (intro-model.ts) on the page clock. With the voice (the optional
// sprite, S7-100) a scene lasts its clip; without it — no recording shipped, muted, or audio still
// locked by the browser — it lasts its fallback reading time, and a locked voice shows the chip
// „Stuknij, by włączyć głos”, which replays the scene with the voice. Each clip dips the music
// (voice.ts). The gameplay scenes are in-engine: the intro's own GameView (intro-view.ts) runs the
// shared sim on a mini layout at the scene's time, so Back, Pause and Next keep stage, subtitles
// and voice together; the other scenes are drawn from the UI kit (IntroArt.tsx).
//
// Input: the buttons (touch, mouse, Tab + Enter); keys ← / → Back / Next, Space pause, Enter Next
// (on a focused button Enter presses it), Esc skips; a pad's d-pad left / right, A Next, X pause,
// B skips. The dialog hands keys and pad intents over (`IntroInput`) while the intro runs; once
// it is over they are the dialog's again. Reduced motion: scenes cross-fade, nothing slides or
// pops; no-flash: nothing blinks.
import {
  type ComponentType,
  lazy,
  type MutableRefObject,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { playVoice, stopVoice, type VoiceStatus, voiceStatus } from '../fx/audio/voice.ts';
import { emitCue } from '../fx/feedback.ts';
import { PAD } from '../input/gamepad.ts';
import { firstGamepad } from '../input/gamepad-access.ts';
import type { NavIntent } from '../input/ui-nav.ts';
import { type InputDevice, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Intro.module.css';
import { KitArt } from './IntroArt.tsx';
import type { IntroStageProps } from './IntroStage.tsx';
import {
  fallbackMs,
  type IntroAction,
  type IntroState,
  introReducer,
  sceneDurations,
  sceneElapsedMs,
  startIntro,
  subtitleChunks,
  subtitleIndexAt,
} from './intro-model.ts';
import { INTRO_SCENES, type IntroClip, introClipsFor } from './intro-script.ts';
import type { IntroClock } from './intro-view.ts';
import { preloadIntroVoice, type VoiceSprite } from './voice-sprite.ts';

const loadStage = () => import('./IntroStage.tsx');

/** No renderer (offline, the chunk failed): the subtitles carry the scene. */
function NoStage() {
  return null;
}

const IntroStage = lazy(() =>
  loadStage().then(
    (module): { default: ComponentType<IntroStageProps> } => ({ default: module.IntroStage }),
    (): { default: ComponentType<IntroStageProps> } => ({ default: NoStage }),
  ),
);

export type IntroEnd = 'finished' | 'skipped';

/** What the dialog around the player forwards to it while the intro runs. */
export type IntroInput = {
  /** A key pressed in the dialog; true when the intro used it. */
  key(event: KeyboardEvent): boolean;
  /** A pad / keyboard nav intent; true when the intro used it. */
  intent(intent: NavIntent): boolean;
  /** Esc: skips a running intro (true); false once it is over. */
  cancel(): boolean;
};

export type IntroPlayerProps = {
  device: InputDevice;
  /** Filled by the player while it is mounted. */
  input?: MutableRefObject<IntroInput | null>;
  /** The last scene ended („finished”) or „Pomiń” was used („skipped”). */
  onEnd?: (end: IntroEnd) => void;
  /** True while a scene plays (the dialog keeps its own yellow for the end card). */
  onRunningChange?: (running: boolean) => void;
};

const noop = (): void => {};
const now = (): number => performance.now();

/** The yellow „Dalej”: it holds the focus, so Enter, Space on it and a pad's A all go on. */
function focusNext(root: HTMLElement | null): void {
  root?.querySelector<HTMLElement>('[data-testid="intro-next"]')?.focus({ preventScroll: true });
}

function isButton(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.closest('button, a[href]') !== null;
}

export function IntroPlayer({ device, input, onEnd, onRunningChange }: IntroPlayerProps) {
  const clips = useMemo(() => introClipsFor(device), [device]);
  const clipsRef = useRef<readonly IntroClip[]>(clips);
  clipsRef.current = clips;
  const timeline = useRef<IntroState>(startIntro(performance.now()));
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const sprite = useRef<VoiceSprite | null>(null);
  /** The scene whose clip is playing; its length is the clip's. */
  const voiced = useRef<number | null>(null);
  /** The pause cut a clip short: Wznów plays the scene again with the voice. */
  const interrupted = useRef(false);
  const stopLine = useRef<() => void>(noop);
  const skipped = useRef(false);
  const ended = useRef(false);
  const [status, setStatus] = useState<VoiceStatus>('unloaded');
  const [chunk, setChunk] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onEnd, onRunningChange });
  callbacks.current = { onEnd, onRunningChange };

  const clipMs = useCallback((clip: IntroClip | undefined): number | null => {
    const ms = clip ? sprite.current?.clips[clip.id]?.durationMs : undefined;
    return ms ?? null;
  }, []);

  const durations = useCallback((): number[] => {
    const lines = clipsRef.current;
    const playing = voiced.current === null ? null : clipMs(lines[voiced.current]);
    return sceneDurations(
      lines.map((clip) => clip.subtitle),
      voiced.current,
      playing,
    );
  }, [clipMs]);

  const act = useCallback(
    (action: IntroAction) => {
      const nextState = introReducer(timeline.current, action, durations());
      if (nextState !== timeline.current) {
        timeline.current = nextState;
        rerender();
      }
    },
    [durations],
  );

  const state = timeline.current;
  const scene = INTRO_SCENES[state.index] ?? INTRO_SCENES[0];
  const clip = clips[state.index];
  const running = !state.done;
  const paused = state.pausedAt !== null;
  const last = state.index === INTRO_SCENES.length - 1;

  // The stage's sim plays the gameplay scene at its scene time (pauses excluded).
  const clock = useCallback((): IntroClock => {
    const current = timeline.current;
    const stage = INTRO_SCENES[current.index]?.stage;
    if (current.done || stage?.kind !== 'engine') {
      return null;
    }
    return { track: stage.track, elapsedMs: sceneElapsedMs(current, now()) };
  }, []);

  // --- Controls ---------------------------------------------------------------------------

  const togglePause = useCallback(() => {
    const current = timeline.current;
    if (current.done) {
      return;
    }
    if (current.pausedAt === null) {
      if (voiced.current === current.index && current.endedAt === null) {
        stopLine.current();
        stopLine.current = noop;
        voiced.current = null;
        interrupted.current = true;
      }
      act({ type: 'togglePause', now: now() });
    } else if (interrupted.current) {
      interrupted.current = false;
      act({ type: 'restart', now: now() });
    } else {
      act({ type: 'togglePause', now: now() });
    }
  }, [act]);

  const goNext = useCallback(() => act({ type: 'next', now: now() }), [act]);
  const goPrev = useCallback(() => act({ type: 'prev', now: now() }), [act]);
  const skip = useCallback(() => {
    if (!timeline.current.done) {
      skipped.current = true;
      act({ type: 'skip' });
    }
  }, [act]);

  const replay = useCallback(() => {
    skipped.current = false;
    ended.current = false;
    interrupted.current = false;
    act({ type: 'start', now: now() });
    callbacks.current.onRunningChange?.(true);
    requestAnimationFrame(() => focusNext(root.current));
  }, [act]);

  // --- Voice --------------------------------------------------------------------------------

  useEffect(() => {
    let live = true;
    // One load per page (S7-102): a replay takes the promise the first player started.
    void preloadIntroVoice().then((loaded) => {
      if (live && loaded) {
        sprite.current = loaded;
      }
    });
    return () => {
      live = false;
      stopVoice();
    };
  }, []);

  // A scene (re)starts: its line plays when the voice can, else the scene runs on fallback time.
  // Only a new scene start may (re)start the line, not a pause or a clip end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the scene's start
  useEffect(() => {
    stopLine.current();
    stopLine.current = noop;
    voiced.current = null;
    if (state.done || state.pausedAt !== null) {
      return;
    }
    const line = clipsRef.current[state.index];
    if (line && clipMs(line) !== null && voiceStatus() === 'ready') {
      voiced.current = state.index;
      stopLine.current = playVoice(line.id, () => act({ type: 'clipEnded', now: now() }));
    }
  }, [state.index, state.startedAt, state.done]);

  useEffect(() => () => stopLine.current(), []);

  // --- The clock ------------------------------------------------------------------------------

  useEffect(() => {
    let frame = 0;
    let padWest = firstGamepad()?.buttons[PAD.west]?.pressed ?? false;
    const loop = () => {
      const time = now();
      act({ type: 'tick', now: time });
      const current = timeline.current;
      const line = clipsRef.current[current.index];
      if (line) {
        const length = voiced.current === current.index ? clipMs(line) : null;
        setChunk(subtitleIndexAt(line.subtitle, length, sceneElapsedMs(current, time)));
      }
      setStatus(voiceStatus());
      // A pad's X pauses: not a nav intent (minigames would see it), so it is polled here.
      const west = firstGamepad()?.buttons[PAD.west]?.pressed ?? false;
      if (west && !padWest && !current.done) {
        useApp.getState().setInputDevice('gamepad');
        emitCue('ui.click');
        togglePause();
      }
      padWest = west;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [act, clipMs, togglePause]);

  // --- The end --------------------------------------------------------------------------------

  useEffect(() => {
    if (state.done && !ended.current) {
      ended.current = true;
      stopLine.current();
      stopLine.current = noop;
      callbacks.current.onRunningChange?.(false);
      callbacks.current.onEnd?.(skipped.current ? 'skipped' : 'finished');
    }
  }, [state.done]);

  useEffect(() => {
    callbacks.current.onRunningChange?.(true);
    focusNext(root.current);
    loadStage().catch(noop);
  }, []);

  // --- Keys and pad intents from the dialog -------------------------------------------------

  useEffect(() => {
    if (!input) {
      return;
    }
    input.current = {
      key(event) {
        if (timeline.current.done || event.altKey || event.ctrlKey || event.metaKey) {
          return false;
        }
        let used = true;
        switch (event.code) {
          case 'ArrowLeft':
            goPrev();
            break;
          case 'ArrowRight':
            goNext();
            break;
          case 'Space':
            togglePause();
            break;
          case 'Enter':
          case 'NumpadEnter':
            if (isButton(event.target)) {
              return false;
            }
            goNext();
            break;
          default:
            used = false;
        }
        if (used) {
          event.preventDefault();
          useApp.getState().setInputDevice('keyboard');
          emitCue('ui.click');
        }
        return used;
      },
      intent(intent) {
        if (timeline.current.done) {
          return false;
        }
        switch (intent) {
          case 'left':
            emitCue('ui.click');
            goPrev();
            return true;
          case 'right':
          case 'confirm':
            emitCue('ui.click');
            goNext();
            return true;
          case 'back':
            emitCue('ui.back');
            skip();
            return true;
          default:
            return false;
        }
      },
      cancel() {
        if (timeline.current.done) {
          return false;
        }
        emitCue('ui.back');
        skip();
        return true;
      },
    };
    return () => {
      input.current = null;
    };
  }, [input, goNext, goPrev, skip, togglePause]);

  if (!running) {
    return (
      <div ref={root} className={styles.player} data-testid="intro-player" data-done="true">
        <div className={styles.end} data-testid="intro-end">
          <Icon name="check" size={56} />
          <p className={styles.endText}>{pl.intro.ended}</p>
          <Button
            variant="secondary"
            icon={<Icon name="retry" size={24} />}
            data-testid="intro-replay"
            onClick={replay}
          >
            {pl.intro.replay}
          </Button>
        </div>
      </div>
    );
  }

  const lineMs = voiced.current === state.index ? clipMs(clip) : null;
  const chunks = clip ? subtitleChunks(clip.subtitle, lineMs ?? fallbackMs(clip.subtitle)) : [];
  const subtitle = chunks[Math.min(chunk, chunks.length - 1)]?.text ?? '';
  const locked = sprite.current !== null && status === 'locked';

  return (
    <div
      ref={root}
      className={styles.player}
      data-testid="intro-player"
      data-scene={scene?.id}
      data-index={state.index}
      data-paused={paused || undefined}
      data-voice={voiced.current === state.index ? 'on' : 'off'}
    >
      <section className={styles.stage} aria-label={pl.intro.stageLabel} data-testid="intro-stage">
        {scene?.stage.kind === 'engine' && (
          <Suspense fallback={null}>
            <IntroStage
              clock={clock}
              callout={scene.stage.callout}
              sceneKey={`${state.index}`}
              device={device}
            />
          </Suspense>
        )}
        {scene?.stage.kind === 'kit' && (
          <div key={`${state.index}`} className={styles.art} data-kind="kit">
            <KitArt art={scene.stage.art} device={device} />
          </div>
        )}
        <ol
          className={styles.dots}
          aria-label={pl.intro.scene(state.index + 1, INTRO_SCENES.length)}
          data-testid="intro-dots"
        >
          {INTRO_SCENES.map((item, index) => (
            <li
              key={item.id}
              className={`${styles.dot} ${index === state.index ? styles.dotOn : ''} ${index < state.index ? styles.dotDone : ''}`}
              aria-hidden="true"
            />
          ))}
        </ol>
        {locked && (
          <button
            type="button"
            className={styles.chip}
            data-testid="intro-voice-chip"
            onClick={() => {
              emitCue('ui.click');
              act({ type: 'restart', now: now() });
            }}
          >
            <Icon name="sound" size={22} />
            {pl.intro.soundLocked}
          </button>
        )}
        {paused && (
          <span className={styles.pausedBadge} aria-hidden="true">
            <Icon name="pause" size={40} />
          </span>
        )}
      </section>

      <p className={styles.subtitle} aria-live="polite" data-testid="intro-subtitle">
        {subtitle}
      </p>

      <div className={styles.controls}>
        <Button
          icon={<Icon name="arrow" size={24} className={styles.flip ?? ''} />}
          data-testid="intro-prev"
          onClick={goPrev}
        >
          {pl.intro.prev}
        </Button>
        <Button
          icon={<Icon name={paused ? 'play' : 'pause'} size={24} />}
          data-testid="intro-pause"
          aria-pressed={paused}
          onClick={togglePause}
        >
          {paused ? pl.intro.resume : pl.intro.pause}
        </Button>
        <Button
          variant="primary"
          icon={<Icon name={last ? 'check' : 'arrow'} size={24} />}
          data-testid="intro-next"
          onClick={goNext}
        >
          {last ? pl.intro.finish : pl.intro.next}
        </Button>
        <Button
          variant="ghost"
          icon={<Icon name="close" size={24} />}
          data-testid="intro-skip"
          onClick={skip}
        >
          {pl.intro.skip}
        </Button>
      </div>
    </div>
  );
}
