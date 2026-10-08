// The feedback catalogue (agents/game-feel.md): every cue's layers in one place. Tuning
// feedback means editing this file, not hunting through components.
import type { HapticPattern } from './haptics.ts';
import type { ParticlePresetId } from './particles/presets.ts';

export type AudioBus = 'ui' | 'sfx' | 'music';

export type SoundLayer = {
  /** One id, or several to pick from at random (variation). */
  ids: readonly string[];
  bus: AudioBus;
  volume?: number;
  /** Random playback-rate spread, e.g. 0.08 → 0.92–1.08. */
  rateJitter?: number;
};

/**
 * Named animation triggers the scene or UI listens for (`feedback.onAnimation`). The cue
 * context says which player / folder / fixture the trigger is about.
 */
export type AnimationTrigger =
  | 'spawnPop'
  | 'squash'
  | 'stampSlam'
  // S2-12 core gameplay triggers.
  /** Folder slides in along the conveyor and settles with a bounce (`folderId`, `fixtureId`). */
  | 'slideIn'
  /** Small hop: the player picking a folder up, or a folder getting a new deadline. */
  | 'hop'
  /** Folder placed with a squash (`folderId`, location in `position`). */
  | 'place'
  /** Player enters / leaves the working pose at a station (`playerId`, `fixtureId`). */
  | 'workStart'
  | 'workStop'
  /** Minigame failed: the sheet / player wobbles. */
  | 'wobble'
  /** Folder near its deadline trembles (`folderId`). */
  | 'tremble'
  /** Folder crumples to dust (`folderId`). */
  | 'crumple'
  /** Floating score text; `value` holds the score delta. */
  | 'scorePop'
  | 'cheer'
  | 'facepalm'
  | 'shrug'
  /** Credibility bar cracks (HUD). */
  | 'credibilityCrack'
  /** Level timer pulse for the last seconds (HUD; steady colour change under no-flash). */
  | 'timerPulse'
  /** Ping bubble pops above the player (the ping layer draws it). */
  | 'pingPop'
  /** Verdict sheet slides up on the desk / back down when closed. */
  | 'deskOpen'
  | 'deskClose'
  | 'slump';

export type ParticleLayer = { preset: ParticlePresetId; count?: number };

/** Looping sounds, started and stopped by cues with a `loopKey` in their context. */
export const loops = {
  typewriter: { ids: ['keys'], bus: 'sfx', volume: 0.38 },
} as const satisfies Record<string, SoundLayer>;

export type LoopId = keyof typeof loops;

export type Cue = {
  severity: 1 | 2 | 3;
  sound?: SoundLayer;
  particles?: ParticleLayer;
  /** A second burst with a different preset (e.g. ink splat under paper bits). */
  extraParticles?: ParticleLayer;
  /** Camera trauma 0..1 (skipped with reduced motion). */
  shake?: number;
  /** Freeze the scene's FX clock this long (skipped with reduced motion). */
  hitStopMs?: number;
  haptic?: HapticPattern;
  animation?: AnimationTrigger | readonly AnimationTrigger[];
  /**
   * Start a looping sound under the context's `loopKey`, stop the one under that key (no key:
   * nothing), or stop every loop.
   */
  loop?: LoopId | 'stop' | 'stopAll';
};

export const cues = {
  'ui.click': {
    severity: 1,
    sound: { ids: ['click'], bus: 'ui', rateJitter: 0.06 },
    haptic: 'tick',
  },
  'ui.hover': { severity: 1, sound: { ids: ['hover'], bus: 'ui', volume: 0.5, rateJitter: 0.1 } },
  'ui.back': { severity: 1, sound: { ids: ['back'], bus: 'ui' }, haptic: 'tick' },
  'ui.copy': { severity: 1, sound: { ids: ['copy'], bus: 'ui', volume: 0.8 }, haptic: 'tick' },
  'player.join': {
    severity: 1,
    sound: { ids: ['join'], bus: 'sfx', volume: 0.8 },
    particles: { preset: 'inkPuff' },
    animation: 'spawnPop',
  },
  'player.reconnect': {
    severity: 1,
    sound: { ids: ['join'], bus: 'sfx', volume: 0.5 },
    particles: { preset: 'inkPuff', count: 8 },
  },
  'player.leave': { severity: 1, sound: { ids: ['leave'], bus: 'sfx', volume: 0.7 } },
  'player.step': {
    severity: 1,
    sound: { ids: ['step1', 'step2'], bus: 'sfx', volume: 0.35, rateJitter: 0.12 },
    particles: { preset: 'dust', count: 1 },
  },
  'player.stepRemote': {
    severity: 1,
    sound: { ids: ['step1', 'step2'], bus: 'sfx', volume: 0.14, rateJitter: 0.12 },
    particles: { preset: 'dust', count: 1 },
  },
  'player.start': {
    severity: 1,
    particles: { preset: 'dust', count: 4 },
    animation: 'squash',
  },
  'player.stop': { severity: 1, animation: 'squash' },
  'game.start': {
    severity: 2,
    sound: { ids: ['start'], bus: 'sfx' },
    shake: 0.25,
    haptic: 'thud',
  },
  'stamp.applied': {
    severity: 2,
    sound: { ids: ['stamp'], bus: 'sfx', rateJitter: 0.05 },
    particles: { preset: 'paperBits' },
    extraParticles: { preset: 'inkSplat' },
    shake: 0.35,
    hitStopMs: 60,
    haptic: 'thud',
    animation: 'stampSlam',
    loop: 'stop',
  },
  // --- S2-12 core gameplay feedback ---------------------------------------------------------
  'folder.arrive': {
    severity: 2,
    sound: { ids: ['arrive'], bus: 'sfx', volume: 0.7, rateJitter: 0.04 },
    particles: { preset: 'paperFlutter' },
    animation: 'slideIn',
  },
  'folder.pickup': {
    severity: 1,
    sound: { ids: ['rustle'], bus: 'sfx', volume: 0.7, rateJitter: 0.1 },
    particles: { preset: 'paperFlutter', count: 3 },
    haptic: 'tick',
    animation: 'hop',
  },
  'folder.drop': {
    severity: 1,
    sound: { ids: ['place'], bus: 'sfx', volume: 0.7, rateJitter: 0.08 },
    particles: { preset: 'dust', count: 3 },
    haptic: 'tick',
    animation: 'place',
  },
  'folder.deadlineWarning': {
    severity: 1,
    sound: { ids: ['warn'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'paperFlutter', count: 3 },
    haptic: 'tick',
    animation: 'tremble',
  },
  /** One beat of the deadline ticker (fx/deadline-ticker.ts); it speeds up near the deadline. */
  'folder.deadlineTick': {
    severity: 1,
    sound: { ids: ['tick'], bus: 'sfx', volume: 0.45, rateJitter: 0.03 },
  },
  'folder.deadlineExtended': {
    severity: 1,
    sound: { ids: ['arrive'], bus: 'sfx', volume: 0.45, rateJitter: 0.04 },
    particles: { preset: 'paperFlutter', count: 4 },
    animation: 'hop',
  },
  'folder.expired': {
    severity: 2,
    sound: { ids: ['buzzer'], bus: 'sfx', volume: 0.75 },
    particles: { preset: 'ash' },
    shake: 0.2,
    haptic: 'thud',
    animation: 'crumple',
  },
  'station.workStart': {
    severity: 1,
    sound: { ids: ['click'], bus: 'sfx', volume: 0.6, rateJitter: 0.08 },
    particles: { preset: 'inkPuff', count: 4 },
    animation: 'workStart',
    loop: 'typewriter',
  },
  'station.workCancel': {
    severity: 1,
    sound: { ids: ['back'], bus: 'sfx', volume: 0.5 },
    particles: { preset: 'dust', count: 2 },
    animation: 'workStop',
    loop: 'stop',
  },
  'minigame.start': {
    severity: 1,
    sound: { ids: ['slide'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'paperFlutter', count: 3 },
    animation: 'workStop',
    loop: 'stop',
  },
  'minigame.fail': {
    severity: 1,
    sound: { ids: ['fail'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'smoke' },
    haptic: 'tick',
    animation: 'wobble',
    loop: 'stop',
  },
  'desk.open': {
    severity: 1,
    sound: { ids: ['deskopen'], bus: 'sfx', volume: 0.7, rateJitter: 0.05 },
    particles: { preset: 'dust', count: 3 },
    animation: 'deskOpen',
  },
  'desk.close': {
    severity: 1,
    sound: { ids: ['back'], bus: 'sfx', volume: 0.4 },
    particles: { preset: 'dust', count: 2 },
    animation: 'deskClose',
  },
  'verdict.correct': {
    severity: 2,
    sound: { ids: ['chime'], bus: 'sfx', volume: 0.8 },
    particles: { preset: 'confetti' },
    haptic: 'tick',
    animation: ['cheer', 'scorePop'],
  },
  'verdict.contextCorrect': {
    severity: 3,
    sound: { ids: ['fanfare'], bus: 'sfx', volume: 0.85 },
    particles: { preset: 'confetti', count: 34 },
    extraParticles: { preset: 'paperBits', count: 8 },
    shake: 0.12,
    haptic: 'thud',
    animation: ['cheer', 'scorePop'],
  },
  'verdict.wrongJustification': {
    severity: 2,
    sound: { ids: ['hmm'], bus: 'sfx', volume: 0.75 },
    particles: { preset: 'inkPuff', count: 8 },
    haptic: 'tick',
    animation: ['shrug', 'scorePop'],
  },
  /** Wrong verdict that is neither a published fake nor a rejected truth. */
  'verdict.wrong': {
    severity: 2,
    sound: { ids: ['lowsting'], bus: 'sfx', volume: 0.6 },
    particles: { preset: 'ash', count: 8 },
    shake: 0.25,
    haptic: 'thud',
    animation: ['shrug', 'scorePop'],
  },
  'verdict.fakePublished': {
    severity: 3,
    sound: { ids: ['alarm'], bus: 'sfx', volume: 0.9 },
    particles: { preset: 'redInk' },
    extraParticles: { preset: 'paperBits', count: 8 },
    shake: 0.7,
    haptic: 'buzz',
    animation: ['facepalm', 'credibilityCrack', 'scorePop'],
  },
  'verdict.truthRejected': {
    severity: 2,
    sound: { ids: ['lowsting'], bus: 'sfx', volume: 0.8 },
    particles: { preset: 'ash', count: 12 },
    shake: 0.4,
    haptic: 'thud',
    animation: ['shrug', 'credibilityCrack', 'scorePop'],
  },
  'ping.needArchive': {
    severity: 1,
    sound: { ids: ['ping1'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'inkPuff', count: 4 },
    animation: 'pingPop',
  },
  'ping.fake': {
    severity: 1,
    sound: { ids: ['ping2'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'inkPuff', count: 4 },
    animation: 'pingPop',
  },
  'ping.mine': {
    severity: 1,
    sound: { ids: ['ping3'], bus: 'sfx', volume: 0.7 },
    particles: { preset: 'inkPuff', count: 4 },
    animation: 'pingPop',
  },
  'level.lastSeconds': {
    severity: 2,
    sound: { ids: ['lastsec'], bus: 'sfx', volume: 0.85 },
    haptic: 'tick',
    animation: 'timerPulse',
  },
  'level.win': {
    severity: 3,
    sound: { ids: ['win'], bus: 'sfx', volume: 0.9 },
    particles: { preset: 'confetti', count: 40 },
    haptic: 'thud',
    animation: 'cheer',
    loop: 'stopAll',
  },
  'level.lose': {
    severity: 3,
    sound: { ids: ['lose'], bus: 'sfx', volume: 0.9 },
    particles: { preset: 'paperBits', count: 24 },
    haptic: 'buzz',
    animation: 'slump',
    loop: 'stopAll',
  },
  // --- Station overlay and desk sheet (S2-03, S2-07). Placeholder sounds until the sound pass.
  'station.open': { severity: 1, sound: { ids: ['copy'], bus: 'ui', volume: 0.6 }, haptic: 'tick' },
  'minigame.success': {
    severity: 1,
    sound: { ids: ['click'], bus: 'sfx', rateJitter: 0.04 },
    haptic: 'tick',
  },
  'desk.justify': {
    severity: 1,
    sound: { ids: ['click'], bus: 'ui', volume: 0.8, rateJitter: 0.06 },
    haptic: 'tick',
  },
  // --- Pings (S2-11). Placeholder sounds until the sound pass adds one per ping type. ------
  'ping.open': { severity: 1, sound: { ids: ['hover'], bus: 'ui', volume: 0.7 }, haptic: 'tick' },
  'ping.send': { severity: 1, sound: { ids: ['click'], bus: 'ui', rateJitter: 0.04 } },
  // Source registry minigame (S2-06): red pencil on an index card.
  'sourceRegistry.circle': {
    severity: 1,
    sound: { ids: ['click'], bus: 'ui', rateJitter: 0.1 },
    haptic: 'tick',
  },
  'sourceRegistry.uncircle': {
    severity: 1,
    sound: { ids: ['hover'], bus: 'ui', volume: 0.7, rateJitter: 0.1 },
    haptic: 'tick',
  },
  'sourceRegistry.mistake': {
    severity: 1,
    sound: { ids: ['back'], bus: 'ui', rateJitter: 0.05 },
    haptic: 'thud',
  },
  'sourceRegistry.file': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.7, rateJitter: 0.05 },
    haptic: 'thud',
  },
  // S2-05 archive minigame: index cards riffling past the reading frame, the drawer braking,
  // a wrong card pulled, and the first mention found.
  'archive.tick': {
    severity: 1,
    sound: { ids: ['hover'], bus: 'ui', volume: 0.35, rateJitter: 0.15 },
  },
  'archive.stop': {
    severity: 1,
    sound: { ids: ['click'], bus: 'ui', volume: 0.8, rateJitter: 0.06 },
    haptic: 'tick',
  },
  'archive.miss': {
    severity: 1,
    sound: { ids: ['back'], bus: 'sfx', rateJitter: 0.05 },
    haptic: 'buzz',
  },
  'archive.found': {
    severity: 2,
    sound: { ids: ['stamp'], bus: 'sfx', volume: 0.8, rateJitter: 0.05 },
    haptic: 'thud',
  },
  // S2-04 image search minigame (placeholder sounds until the sound unit lands).
  'imageSearch.fragment': {
    severity: 1,
    sound: { ids: ['hover'], bus: 'ui', volume: 0.8, rateJitter: 0.1 },
  },
  'imageSearch.match': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.7, rateJitter: 0.05 },
    haptic: 'tick',
  },
  'imageSearch.miss': {
    severity: 1,
    sound: { ids: ['back'], bus: 'ui', rateJitter: 0.05 },
    haptic: 'thud',
  },
  // Lobby (S2-10): signing the duty roster as ready presses a small stamp.
  'lobby.ready': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.6, rateJitter: 0.05 },
    haptic: 'tick',
  },
  // S3-02 / S3-08 debrief (Kolegium): DOM animations live in debrief/, these are their sounds.
  'debrief.star': {
    severity: 2,
    sound: { ids: ['chime'], bus: 'ui', volume: 0.8, rateJitter: 0.03 },
    haptic: 'tick',
  },
  'debrief.mark': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.75, rateJitter: 0.06 },
    haptic: 'tick',
  },
  'debrief.vote': {
    severity: 1,
    sound: { ids: ['place'], bus: 'ui', volume: 0.7, rateJitter: 0.05 },
    haptic: 'tick',
  },
  // S3-03 briefing: the newspaper card whooshes in and slaps onto the desk; "Gotowy!" stamps.
  'briefing.intro': {
    severity: 1,
    sound: { ids: ['slide'], bus: 'ui', volume: 0.8 },
  },
  'briefing.land': {
    severity: 2,
    sound: { ids: ['place'], bus: 'ui', rateJitter: 0.05 },
    haptic: 'thud',
  },
  'briefing.ready': {
    severity: 1,
    sound: { ids: ['stamp'], bus: 'ui', volume: 0.7, rateJitter: 0.05 },
    haptic: 'tick',
  },
} as const satisfies Record<string, Cue>;

export type CueId = keyof typeof cues;
export const cueIds = Object.keys(cues) as CueId[];
