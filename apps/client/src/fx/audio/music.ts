// Music v1 (S2-13): a menu loop, and two in-sync level layers (calm + pressure) whose mix follows
// the game's intensity (music-intensity.ts). Screens request a scene with `requestMusic`; a small
// ticker cross-fades between scenes, slews the intensity and the tempo, and applies the music bus
// volume from settings. Global mute and hidden-tab mute are handled by `initAudio`.
// Nothing starts before the first user gesture (browser autoplay policy).
import { Howl } from 'howler';
import { useGame } from '../../net/game-store.ts';
import { useSettings } from '../../store/settings.ts';
import { busVolume } from './audio-manager.ts';
import { MUSIC_TUNING, slew, targetIntensity, targetRate } from './music-intensity.ts';

export type MusicScene = 'menu' | 'game';
type TrackId = 'menu' | 'calm' | 'pressure';

/** All loops are 16 bars at 104 BPM (tools/audio/synth_music.py); the sprite cuts encoder padding. */
const LOOP_MS = ((16 * 4 * 60) / 104) * 1000;
const TRACK_IDS: readonly TrackId[] = ['menu', 'calm', 'pressure'];
/** Per-track mix level relative to the music bus. */
const TRACK_LEVEL: Record<TrackId, number> = { menu: 0.8, calm: 0.75, pressure: 0.8 };
const TICK_MS = 50;
/** Ticks can stall in a background tab; never slew further than this in one step. */
const MAX_DT_S = 0.25;
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

const howls: Record<TrackId, Howl | null> = { menu: null, calm: null, pressure: null };
const playIds: Record<TrackId, number | null> = { menu: null, calm: null, pressure: null };
const volumes: Record<TrackId, number> = { menu: 0, calm: 0, pressure: 0 };

let requested: MusicScene | null = null;
let unlocked = false;
let menuGain = 0;
let gameGain = 0;
let intensity = 0;
let rate = 1;
let timer: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;

function howl(track: TrackId): Howl {
  let h = howls[track];
  if (!h) {
    h = new Howl({
      src: [`/assets/audio/music/${track}.webm`, `/assets/audio/music/${track}.mp3`],
      sprite: { loop: [0, LOOP_MS, true] },
      volume: 0,
      preload: true,
    });
    howls[track] = h;
  }
  return h;
}

function loaded(track: TrackId): boolean {
  return howls[track]?.state() === 'loaded';
}

function start(track: TrackId): void {
  const h = howl(track);
  const id = h.play('loop');
  h.volume(0, id);
  playIds[track] = id;
}

function stop(track: TrackId): void {
  const id = playIds[track];
  if (id !== null) {
    howls[track]?.stop(id);
  }
  playIds[track] = null;
  volumes[track] = 0;
}

function onGesture(): void {
  unlocked = true;
  for (const type of GESTURES) {
    window.removeEventListener(type, onGesture, true);
  }
  ensureTicker();
}

function listenForGesture(): void {
  for (const type of GESTURES) {
    window.addEventListener(type, onGesture, true);
  }
}

function ensureTicker(): void {
  if (timer === null) {
    lastTick = performance.now();
    timer = setInterval(tick, TICK_MS);
  }
}

function tick(): void {
  const now = performance.now();
  const dt = Math.min(MAX_DT_S, (now - lastTick) / 1000);
  lastTick = now;
  if (!unlocked) {
    return;
  }

  const fade = MUSIC_TUNING.fadePerS;
  menuGain = slew(menuGain, requested === 'menu' ? 1 : 0, fade, fade, dt);
  gameGain = slew(gameGain, requested === 'game' ? 1 : 0, fade, fade, dt);
  const game = useGame.getState();
  const inGame = requested === 'game';
  intensity = slew(
    intensity,
    inGame ? targetIntensity(game) : 0,
    MUSIC_TUNING.intensityUpPerS,
    MUSIC_TUNING.intensityDownPerS,
    dt,
  );
  rate = slew(
    rate,
    inGame ? targetRate(game) : 1,
    MUSIC_TUNING.ratePerS,
    MUSIC_TUNING.ratePerS,
    dt,
  );

  // Menu loop.
  if (menuGain > 0 && playIds.menu === null && loaded('menu')) {
    start('menu');
  } else if (menuGain === 0 && playIds.menu !== null) {
    stop('menu');
  }
  // Level layers start together so they stay in sync.
  if (gameGain > 0 && playIds.calm === null && loaded('calm') && loaded('pressure')) {
    start('calm');
    start('pressure');
  } else if (gameGain === 0 && playIds.calm !== null) {
    stop('calm');
    stop('pressure');
    rate = 1;
  }

  const bus = busVolume(useSettings.getState(), 'music');
  const gains: Record<TrackId, number> = {
    menu: menuGain,
    calm: gameGain,
    pressure: gameGain * intensity,
  };
  for (const track of TRACK_IDS) {
    const id = playIds[track];
    const h = howls[track];
    if (id === null || !h) {
      continue;
    }
    const volume = gains[track] * TRACK_LEVEL[track] * bus;
    if (Math.abs(volume - volumes[track]) > 1e-4) {
      h.volume(volume, id);
      volumes[track] = volume;
    }
    if (track !== 'menu' && Math.abs(h.rate(id) - rate) > 1e-4) {
      h.rate(rate, id);
    }
  }

  const idle = requested === null && menuGain === 0 && gameGain === 0;
  if (idle && timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Asks for the given scene's music (menu loop, or the level layers). Returns a release
 * function for effect cleanup; releasing fades the music out unless another screen requests a
 * scene in the meantime (menu → lobby keeps the menu loop playing without a gap).
 */
export function requestMusic(scene: MusicScene): () => void {
  if (scene === 'menu') {
    howl('menu');
  } else {
    howl('calm');
    howl('pressure');
  }
  if (!unlocked) {
    listenForGesture();
  }
  requested = scene;
  ensureTicker();
  return () => {
    if (requested === scene) {
      requested = null;
    }
  };
}

export type MusicDebug = {
  requested: MusicScene | null;
  unlocked: boolean;
  playing: TrackId[];
  intensity: number;
  targetIntensity: number;
  rate: number;
  /** Volumes as set on the tracks (music bus included). */
  volumes: Record<TrackId, number>;
  /** What is actually audible: zero while muted or the tab is hidden. */
  audible: Record<TrackId, number>;
};

export function musicDebug(): MusicDebug {
  const silenced = useSettings.getState().muted || document.hidden;
  const playing = TRACK_IDS.filter((t) => playIds[t] !== null);
  const audible = { menu: 0, calm: 0, pressure: 0 };
  for (const t of playing) {
    audible[t] = silenced ? 0 : volumes[t];
  }
  return {
    requested,
    unlocked,
    playing,
    intensity,
    targetIntensity: requested === 'game' ? targetIntensity(useGame.getState()) : 0,
    rate,
    volumes: { ...volumes },
    audible,
  };
}

// Dev hook for e2e checks (?debug): `window.__music.state()`, and `window.__music.game` to inject
// fixture state into the game store, `window.__music.settings` to change volumes and mute.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __music: unknown }).__music = {
    state: musicDebug,
    game: useGame,
    settings: useSettings,
  };
}
