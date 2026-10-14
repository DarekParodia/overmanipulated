// Audio policy of the spectate screen (S7-90). A spectator hears the moments that matter (verdict
// outcomes, an expired folder, a level event starting, a raid beaten off, a role ability landing),
// quieter than a player does and, while both newsrooms are on screen, Kurier on the left and Głos
// on the right. Every other cue of a watched newsroom still plays its particles and animations,
// but silently (`CueContext.silent`). No haptics, no shake, no captions: the event feed (S7-91)
// is the visual twin of every audible cue.
import type { TeamIndex } from '@redakcja/shared';
import type { CueId } from '../fx/cues.ts';
import type { FeedbackOutputs } from '../fx/feedback.ts';

/** The cues a spectator hears; the rest of a watched newsroom's cues are silent. */
export const SPECTATOR_AUDIBLE_CUES: ReadonlySet<CueId> = new Set<CueId>([
  'verdict.correct',
  'verdict.contextCorrect',
  'verdict.wrongJustification',
  'verdict.wrong',
  'verdict.fakePublished',
  'verdict.truthRejected',
  'folder.expired',
  'event.viral.start',
  'event.bossCall.start',
  'event.botRaid.start',
  'event.outage.start',
  'event.correction.start',
  'event.raidResolved',
  'ability.expertise',
  'ability.call.start',
  'ability.call.done',
  'ability.call.dropped',
  'ability.extendDeadline',
  'ability.secondChance',
  'ability.pass',
  'role.rescue',
]);

/** Spectator sound effects play at this share of a player's volume. */
export const SPECTATOR_SFX_GAIN = 0.6;
/** Stereo position of each newsroom while both are on screen: Kurier left, Głos right. */
export const TEAM_PAN: readonly number[] = [-0.5, 0.5];

export function isSpectatorAudible(cue: CueId): boolean {
  return SPECTATOR_AUDIBLE_CUES.has(cue);
}

/** Where a newsroom's sounds sit: its side while split, the centre when it is alone. */
export function teamPan(team: TeamIndex, split: boolean): number {
  return split ? (TEAM_PAN[team] ?? 0) : 0;
}

type PlaySound = NonNullable<FeedbackOutputs['playSound']>;

/**
 * A watched newsroom's sound output: the player's `playSound` at SPECTATOR_SFX_GAIN, panned to
 * the team's side instead of the on-screen position.
 */
export function spectatorSoundOutput(play: PlaySound, pan: number): PlaySound {
  return (ids, bus, volume, rateJitter) =>
    play(ids, bus, volume * SPECTATOR_SFX_GAIN, rateJitter, pan);
}
