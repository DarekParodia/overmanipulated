// Howler-based audio: one sprite for all SFX, buses with settings-driven volume, a limiter on the
// output bus, stereo pan, mobile autoplay unlock and mute while the tab is hidden. Also runs the
// newsroom ambience during play: the room-tone loop, the voice-less chatter bed and random distant
// one-shots (ambience.ts, mix.ts). Big stingers dip the music (duck.ts).
import { Howl, Howler } from 'howler';
import { selectOperatedDesk, selectOperatedStation, useGame } from '../../net/game-store.ts';
import { useQuality } from '../../scene/quality.ts';
import { useApp } from '../../store/app.ts';
import { type Settings, useSettings } from '../../store/settings.ts';
import { type AudioBus, cues } from '../cues.ts';
import { createAmbience } from './ambience.ts';
import { DUCKING_SOUNDS, musicDucker, soundDurationMs } from './duck.ts';
import { BUS_TRIM, chatterLevel, LIMITER, type MixSettings } from './mix.ts';
import sprite from './sfx-sprite.json';

type SpriteMap = Record<string, [number, number, boolean]>;
const spriteMap = sprite as unknown as SpriteMap;

export const soundIds: ReadonlySet<string> = new Set(Object.keys(spriteMap));

let sfx: Howl | null = null;
let ambienceId: number | null = null;
let chatterId: number | null = null;
let limiterInstalled = false;

/** Effective volume of a bus (master × bus level), before global mute. */
export function busVolume(settings: Settings, bus: AudioBus): number {
  const busLevel =
    bus === 'ui' ? settings.uiVolume : bus === 'music' ? settings.musicVolume : settings.sfxVolume;
  return settings.masterVolume * busLevel * BUS_TRIM[bus];
}

/**
 * Puts a limiter (a fast DynamicsCompressor) between Howler's gain stage and the speakers, so
 * stacked stingers and the music never clip. Safe to call repeatedly; call after the first Howl
 * exists (that is when Howler creates its audio context).
 */
export function installMasterLimiter(): void {
  const ctx = Howler.ctx;
  const gainStage = Howler.masterGain;
  if (limiterInstalled || !Howler.usingWebAudio || !ctx || !gainStage) {
    return;
  }
  limiterInstalled = true;
  try {
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = LIMITER.thresholdDb;
    limiter.knee.value = LIMITER.kneeDb;
    limiter.ratio.value = LIMITER.ratio;
    limiter.attack.value = LIMITER.attackS;
    limiter.release.value = LIMITER.releaseS;
    gainStage.disconnect();
    gainStage.connect(limiter);
    limiter.connect(ctx.destination);
  } catch {
    // Without a limiter the audio still plays: drop any half-built path, go straight to the output.
    try {
      gainStage.disconnect();
      gainStage.connect(ctx.destination);
    } catch {
      // Nothing more to do.
    }
  }
}

function load(): Howl {
  if (!sfx) {
    const howlSprite: Record<string, [number, number] | [number, number, boolean]> = {};
    for (const [id, [offset, duration, loop]] of Object.entries(spriteMap)) {
      howlSprite[id] = loop ? [offset, duration, true] : [offset, duration];
    }
    sfx = new Howl({
      src: ['/assets/audio/sfx.webm', '/assets/audio/sfx.mp3'],
      sprite: howlSprite,
      preload: true,
    });
    installMasterLimiter();
  }
  return sfx;
}

export function playSound(
  ids: readonly string[],
  bus: AudioBus,
  volume: number,
  rateJitter: number,
  pan: number,
): void {
  const id = ids[Math.floor(Math.random() * ids.length)];
  if (!id || !soundIds.has(id)) {
    return;
  }
  const howl = load();
  // Only a stinger the player can hear dips the music.
  if (DUCKING_SOUNDS.has(id) && busVolume(useSettings.getState(), bus) * volume > 0.02) {
    musicDucker.request(performance.now(), soundDurationMs(id));
  }
  const playId = playOn(howl, id, bus, volume);
  if (rateJitter > 0) {
    howl.rate(1 + (Math.random() * 2 - 1) * rateJitter, playId);
  }
  if (pan !== 0) {
    howl.stereo(pan, playId);
  }
}

function playOn(howl: Howl, id: string, bus: AudioBus, volume: number): number {
  const playId = howl.play(id);
  howl.volume(Math.min(1, busVolume(useSettings.getState(), bus) * volume), playId);
  return playId;
}

/** Running loops (fx/audio/loops.ts) with their bus, so volume changes reach them. */
const loopVolumes = new Map<number, { bus: AudioBus; volume: number }>();

/** Starts a looping sprite (loop flag set in the sprite map); returns its Howler id. */
export function startLoopSound(id: string, bus: AudioBus, volume: number): number | null {
  if (!soundIds.has(id) || !spriteMap[id]?.[2]) {
    return null;
  }
  const playId = playOn(load(), id, bus, volume);
  loopVolumes.set(playId, { bus, volume });
  return playId;
}

export function stopSound(playId: number): void {
  loopVolumes.delete(playId);
  sfx?.stop(playId);
}

/** Room tone level relative to the sfx bus, before ducking. */
const ROOMTONE_LEVEL = 0.6;
const AMBIENCE_TICK_MS = 250;
let bedGain = 1;
let ambienceTimer: ReturnType<typeof setInterval> | null = null;

function applyRoomTone(settings: Settings): void {
  if (sfx && ambienceId !== null) {
    sfx.volume(busVolume(settings, 'sfx') * ROOMTONE_LEVEL * bedGain, ambienceId);
  }
  applyChatter(settings);
}

/** Effective settings for the mix rules: the Auto quality preset resolved to the live one. */
function mixSettings(settings: Settings): MixSettings {
  return { ...settings, quality: settings.quality ?? useQuality.getState().profile.preset };
}

/**
 * The chatter bed plays only while it is audible: it is started and stopped when the
 * reduced-audio rule flips (muted, low quality, sfx near zero), not just set to volume 0.
 */
function applyChatter(settings: Settings): void {
  if (!sfx || ambienceId === null) {
    return;
  }
  const volume = busVolume(settings, 'sfx') * chatterLevel(mixSettings(settings), bedGain);
  if (volume <= 0) {
    if (chatterId !== null) {
      sfx.stop(chatterId);
      chatterId = null;
    }
    return;
  }
  if (chatterId === null) {
    chatterId = sfx.play('ambchatter');
  }
  sfx.volume(Math.min(1, volume), chatterId);
}

const ambience = createAmbience({
  play(cue, gain, pan) {
    if (useSettings.getState().muted) {
      return;
    }
    const sound = cues[cue].sound;
    playSound(sound.ids, sound.bus, sound.volume * gain, sound.rateJitter, pan);
  },
  setBedGain(gain) {
    if (gain !== bedGain) {
      bedGain = gain;
      applyRoomTone(useSettings.getState());
    }
  },
});

/** Duck the bed while the local player works in a station or desk overlay, or on results. */
function ambienceDucked(): boolean {
  const game = useGame.getState();
  const playerId = useApp.getState().playerId;
  return (
    game.levelEnd !== null ||
    selectOperatedStation(game, playerId) !== undefined ||
    selectOperatedDesk(game, playerId) !== undefined
  );
}

/** Starts the newsroom room-tone loop and the random ambience one-shots (idempotent). */
export function startAmbience(): void {
  const howl = load();
  if (ambienceId !== null) {
    return;
  }
  bedGain = 1;
  ambienceId = howl.play('roomtone');
  applyRoomTone(useSettings.getState());
  ambience.reset(performance.now());
  ambienceTimer = setInterval(
    () => ambience.tick(performance.now(), ambienceDucked()),
    AMBIENCE_TICK_MS,
  );
}

export function stopAmbience(): void {
  if (sfx && ambienceId !== null) {
    sfx.stop(ambienceId);
  }
  if (sfx && chatterId !== null) {
    sfx.stop(chatterId);
  }
  ambienceId = null;
  chatterId = null;
  if (ambienceTimer !== null) {
    clearInterval(ambienceTimer);
    ambienceTimer = null;
  }
}

/** Wires global mute to settings and tab visibility. Returns a cleanup function. */
export function initAudio(): () => void {
  const apply = () => {
    const settings = useSettings.getState();
    Howler.mute(settings.muted || document.hidden);
    applyRoomTone(settings);
    for (const [playId, loop] of loopVolumes) {
      sfx?.volume(Math.min(1, busVolume(settings, loop.bus) * loop.volume), playId);
    }
  };
  apply();
  const unsubscribe = useSettings.subscribe(apply);
  const unsubscribeQuality = useQuality.subscribe(apply);
  document.addEventListener('visibilitychange', apply);
  return () => {
    unsubscribe();
    unsubscribeQuality();
    document.removeEventListener('visibilitychange', apply);
  };
}

/** S5-07: loads and decodes the SFX sprite ahead of the first match; resolves when ready (or failed). */
export function preloadSfx(): Promise<void> {
  const howl = load();
  if (howl.state() === 'loaded') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    howl.once('load', () => resolve());
    howl.once('loaderror', () => resolve());
  });
}
