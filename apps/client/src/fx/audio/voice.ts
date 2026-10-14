// Intro voiceover (S7-98): one narrator sprite on the `voice` bus with its own 'Lektor' slider,
// and a deeper music duck (DUCK_TUNING.voiceDepth) while a line plays. Voice lines are not cues:
// the intro subtitles every line (agents/game-feel.md), so when the voice cannot play (muted, not
// loaded, audio still locked by the browser) `playVoice` does nothing and the intro runs on its
// fallback timing. Nothing is fetched before `loadVoice`, and never in the first-load path.
// The player is pure over a small backend so it is tested without Howler; the module instance at
// the bottom wires it to Howler, the settings store and the shared music ducker.
import { Howl, Howler } from 'howler';
import { type Settings, useSettings } from '../../store/settings.ts';
import { DUCK_TUNING, type Ducker, musicDucker } from './duck.ts';
import { installMasterLimiter } from './limiter.ts';
import { busVolume } from './mix.ts';

/** One line in the voice sprite (`/assets/voice/intro.json`, `intro/voice-sprite.ts`, S7-100). */
export type VoiceClip = { startMs: number; durationMs: number };
export type VoiceClips = Readonly<Record<string, VoiceClip>>;

/** Whether the voice can play right now, and if not, why. */
export type VoiceStatus = 'unloaded' | 'muted' | 'locked' | 'ready';

/** Both formats; Howler takes the first one the browser can decode. */
export const VOICE_SOURCES: readonly string[] = [
  '/assets/voice/intro.webm',
  '/assets/voice/intro.mp3',
];
/** `loadVoice` gives up (resolves false) after this long; a load that lands later still plays. */
export const VOICE_LOAD_TIMEOUT_MS = 4000;

/** What the voice player needs from Howler and the browser; tests pass a fake. */
export type VoiceBackend = {
  /** Starts fetching and decoding the sprite; calls `done` once: true when it can play. */
  load(clips: VoiceClips, done: (ok: boolean) => void): void;
  /** True once the sprite is decoded. */
  loaded(): boolean;
  /** Plays one clip at `volume`; `onEnd` runs when it finishes by itself. Null if it cannot. */
  play(id: string, volume: number, onEnd: () => void): number | null;
  stop(handle: number): void;
  setVolume(handle: number, volume: number): void;
  /** True while the browser still blocks audio (no user gesture on the page yet). */
  locked(): boolean;
  settings(): Settings;
  now(): number;
  after(ms: number, fn: () => void): void;
};

export type VoicePlayer = {
  /** Loads the sprite once; resolves false on a load error or after VOICE_LOAD_TIMEOUT_MS. */
  load(clips: VoiceClips): Promise<boolean>;
  status(): VoiceStatus;
  /**
   * Plays one line (stopping the previous one) and dips the music under it. A no-op when the
   * status is not 'ready' or the clip is unknown: `onEnd` never runs and the caller keeps its
   * fallback timer. Returns a function that stops this line.
   */
  play(id: string, onEnd: () => void): () => void;
  /** Stops the current line, if any, and lets the music come back. */
  stop(): void;
  /** Applies the volume settings to the line that is playing. */
  applyVolume(settings: Settings): void;
};

const noop = (): void => {};

function voiceVolume(settings: Settings): number {
  return Math.min(1, busVolume(settings, 'voice'));
}

export function createVoicePlayer(backend: VoiceBackend, ducker: Ducker): VoicePlayer {
  let clips: VoiceClips | null = null;
  let pending: Promise<boolean> | null = null;
  let current: number | null = null;

  function status(): VoiceStatus {
    if (clips === null || !backend.loaded()) {
      return 'unloaded';
    }
    const settings = backend.settings();
    if (settings.muted || voiceVolume(settings) <= 0) {
      return 'muted';
    }
    return backend.locked() ? 'locked' : 'ready';
  }

  function stop(): void {
    if (current === null) {
      return;
    }
    backend.stop(current);
    current = null;
    ducker.release(DUCK_TUNING.voiceDepth);
  }

  return {
    load(next) {
      if (pending) {
        return pending;
      }
      clips = next;
      pending = new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (ok: boolean) => {
          if (!settled) {
            settled = true;
            resolve(ok);
          }
        };
        backend.load(next, settle);
        backend.after(VOICE_LOAD_TIMEOUT_MS, () => settle(false));
      });
      return pending;
    },
    status,
    play(id, onEnd) {
      const clip = clips?.[id];
      if (!clip || status() !== 'ready') {
        return noop;
      }
      stop();
      let handle: number | null = null;
      let ended = false;
      handle = backend.play(id, voiceVolume(backend.settings()), () => {
        ended = true;
        if (handle !== null && current === handle) {
          current = null;
        }
        onEnd();
      });
      if (handle === null || ended) {
        return noop;
      }
      current = handle;
      ducker.request(backend.now(), clip.durationMs, DUCK_TUNING.voiceDepth);
      const mine = handle;
      return () => {
        if (current === mine) {
          stop();
        }
      };
    },
    stop,
    applyVolume(settings) {
      if (current !== null) {
        backend.setVolume(current, voiceVolume(settings));
      }
    },
  };
}

let howl: Howl | null = null;

/** User activation is what the autoplay policy checks; older browsers fall back to Howler. */
function audioLocked(): boolean {
  const activation = globalThis.navigator?.userActivation;
  if (activation) {
    return !activation.hasBeenActive;
  }
  return Howler.ctx?.state !== 'running';
}

const howlerBackend: VoiceBackend = {
  load(clips, done) {
    const sprite: Record<string, [number, number]> = {};
    for (const [id, clip] of Object.entries(clips)) {
      sprite[id] = [clip.startMs, clip.durationMs];
    }
    howl = new Howl({ src: [...VOICE_SOURCES], sprite, preload: true });
    howl.once('load', () => done(true));
    howl.once('loaderror', () => done(false));
    installMasterLimiter();
  },
  loaded: () => howl?.state() === 'loaded',
  play(id, volume, onEnd) {
    if (!howl) {
      return null;
    }
    const playId = howl.play(id);
    howl.volume(volume, playId);
    howl.once('end', onEnd, playId);
    return playId;
  },
  stop(handle) {
    howl?.off('end', handle);
    howl?.stop(handle);
  },
  setVolume(handle, volume) {
    howl?.volume(volume, handle);
  },
  locked: audioLocked,
  settings: () => useSettings.getState(),
  now: () => performance.now(),
  after(ms, fn) {
    setTimeout(fn, ms);
  },
};

const player = createVoicePlayer(howlerBackend, musicDucker);

/** Fetches and decodes the intro voice sprite (once). Resolves false if it is not playable. */
export function loadVoice(clips: VoiceClips): Promise<boolean> {
  return player.load(clips);
}

export function voiceStatus(): VoiceStatus {
  return player.status();
}

/** Plays one intro line; see VoicePlayer.play. */
export function playVoice(id: string, onEnd: () => void): () => void {
  return player.play(id, onEnd);
}

export function stopVoice(): void {
  player.stop();
}

/** Called from `initAudio`'s settings subscription (audio-manager.ts). */
export function applyVoiceVolume(settings: Settings): void {
  player.applyVolume(settings);
}
