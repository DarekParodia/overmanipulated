// Music (S2-13, S5-08): a menu loop, and per level (1-6 and endless) two in-sync layers (calm +
// pressure) with their own key, tempo and instrumentation. The mix follows the game's intensity
// (music-intensity.ts) and dips under big stingers (duck.ts). Screens request a scene with
// `requestMusic`; a small ticker cross-fades between scenes, slews the intensity and the tempo,
// and applies the music bus volume from settings. Global mute and hidden-tab mute are handled by
// `initAudio`. Nothing is fetched or started before the first user gesture (autoplay policy), and
// a level's files are fetched only when that level starts (never in the first-load path).
import { Howl } from 'howler';
import { useGame } from '../../net/game-store.ts';
import { useApp } from '../../store/app.ts';
import { useSettings } from '../../store/settings.ts';
import { busVolume, installMasterLimiter } from './audio-manager.ts';
import { musicDucker } from './duck.ts';
import {
  layerGains,
  MUSIC_TUNING,
  slew,
  type TrackSet,
  targetIntensity,
  targetRate,
  trackSetForLevel,
} from './music-intensity.ts';
import manifest from './music-manifest.json';

export type MusicScene = 'menu' | 'game';
type TrackId = 'menu' | 'calm' | 'pressure';

const loopLengths = manifest as Record<string, { loopMs: number }>;
/** Loop length of a track set (tools/audio/synth_music.py); the sprite cuts the encoder padding. */
function loopMs(set: TrackSet | 'menu'): number {
  return loopLengths[set]?.loopMs ?? 36_923;
}
const TRACK_IDS: readonly TrackId[] = ['menu', 'calm', 'pressure'];
/** Per-track mix level relative to the music bus. */
const TRACK_LEVEL: Record<TrackId, number> = { menu: 0.8, calm: 0.8, pressure: 0.9 };
const TICK_MS = 50;
/** Ticks can stall in a background tab; never slew further than this in one step. */
const MAX_DT_S = 0.25;
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;

/** Howls by file name (`menu`, `l3`, `l3-pressure`); a level's pair is dropped when another starts. */
const howls = new Map<string, Howl>();
let activeSet: TrackSet = 'l1';
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

function fileOf(track: TrackId): string {
  return track === 'menu' ? 'menu' : track === 'calm' ? activeSet : `${activeSet}-pressure`;
}

function howl(track: TrackId): Howl {
  const file = fileOf(track);
  let h = howls.get(file);
  if (!h) {
    h = new Howl({
      src: [`/assets/audio/music/${file}.webm`, `/assets/audio/music/${file}.mp3`],
      sprite: { loop: [0, loopMs(track === 'menu' ? 'menu' : activeSet), true] },
      volume: 0,
      preload: true,
    });
    howls.set(file, h);
    installMasterLimiter();
  }
  return h;
}

function loaded(track: TrackId): boolean {
  return howls.get(fileOf(track))?.state() === 'loaded';
}

/** Switches to the level's track set; the previous set's files are stopped and unloaded. */
function selectSet(set: TrackSet): void {
  if (set === activeSet) {
    return;
  }
  stop('calm');
  stop('pressure');
  for (const suffix of ['', '-pressure']) {
    const old = howls.get(`${activeSet}${suffix}`);
    old?.unload();
    howls.delete(`${activeSet}${suffix}`);
  }
  activeSet = set;
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
    howls.get(fileOf(track))?.stop(id);
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

  // Fetch only what the requested scene needs, and only now that a gesture unlocked audio.
  if (requested === 'menu') {
    howl('menu');
  } else if (requested === 'game') {
    howl('calm');
    howl('pressure');
  }

  // A scene fades in once its files are ready, so a slow download never starts mid-fade.
  const menuReady = requested === 'menu' && loaded('menu');
  const gameReady = requested === 'game' && loaded('calm') && loaded('pressure');
  const fade = MUSIC_TUNING.fadePerS;
  menuGain = slew(menuGain, menuReady ? 1 : 0, fade, fade, dt);
  gameGain = slew(gameGain, gameReady ? 1 : 0, fade, fade, dt);
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

  const duck = musicDucker.step(now, dt);
  const bus = busVolume(useSettings.getState(), 'music') * duck;
  const layers = layerGains(gameGain, intensity);
  const gains: Record<TrackId, number> = {
    menu: menuGain,
    calm: layers.calm,
    pressure: layers.pressure,
  };
  for (const track of TRACK_IDS) {
    const id = playIds[track];
    const h = howls.get(fileOf(track));
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
  if (scene === 'game') {
    selectSet(trackSetForLevel(useApp.getState().room?.levelId));
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
  /** Track set of the level music (`l1`..`l6`, `endless`). */
  set: TrackSet;
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
    set: activeSet,
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
