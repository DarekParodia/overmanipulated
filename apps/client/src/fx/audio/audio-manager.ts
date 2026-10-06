// Howler-based audio: one sprite for all placeholder SFX, buses with settings-driven volume,
// stereo pan, mobile autoplay unlock and mute while the tab is hidden.
import { Howl, Howler } from 'howler';
import { type Settings, useSettings } from '../../store/settings.ts';
import type { AudioBus } from '../cues.ts';
import sprite from './sfx-sprite.json';

type SpriteMap = Record<string, [number, number, boolean]>;
const spriteMap = sprite as unknown as SpriteMap;

export const soundIds: ReadonlySet<string> = new Set(Object.keys(spriteMap));

let sfx: Howl | null = null;
let ambienceId: number | null = null;

/** Effective volume of a bus (master × bus level), before global mute. */
export function busVolume(settings: Settings, bus: AudioBus): number {
  const busLevel =
    bus === 'ui' ? settings.uiVolume : bus === 'music' ? settings.musicVolume : settings.sfxVolume;
  return settings.masterVolume * busLevel;
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

/** Starts the newsroom room-tone loop (idempotent). */
export function startAmbience(): void {
  const howl = load();
  if (ambienceId !== null) {
    return;
  }
  ambienceId = howl.play('roomtone');
  howl.volume(busVolume(useSettings.getState(), 'sfx') * 0.6, ambienceId);
}

export function stopAmbience(): void {
  if (sfx && ambienceId !== null) {
    sfx.stop(ambienceId);
  }
  ambienceId = null;
}

/** Wires global mute to settings and tab visibility. Returns a cleanup function. */
export function initAudio(): () => void {
  const apply = () => {
    const settings = useSettings.getState();
    Howler.mute(settings.muted || document.hidden);
    if (sfx && ambienceId !== null) {
      sfx.volume(busVolume(settings, 'sfx') * 0.6, ambienceId);
    }
    for (const [playId, loop] of loopVolumes) {
      sfx?.volume(Math.min(1, busVolume(settings, loop.bus) * loop.volume), playId);
    }
  };
  apply();
  const unsubscribe = useSettings.subscribe(apply);
  document.addEventListener('visibilitychange', apply);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', apply);
  };
}
