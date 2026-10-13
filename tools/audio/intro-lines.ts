// Intro line export for the voiceover (S7-99): prints every narrator clip as JSON on stdout,
// `{ [clipId]: { subtitle, tts } }`, in scene order. Writes no file. The voice generator
// (`tools/audio/synth_voice.py`, S7-100) reads this output, speaks `tts` and keys the voice
// sprite on the clip ids; the sync test compares the sprite against `subtitle`.
//
//   bun tools/audio/intro-lines.ts
//
// `tts` is the subtitle as a TTS engine should read it: non-breaking spaces become plain spaces,
// the Polish quotes go, and the key and button names are respelled as they are said
// (`PRONOUNCE`), since a lone capital letter is read unreliably.
import { INTRO_CLIPS } from '../../apps/client/src/intro/intro-script.ts';

/**
 * Respellings, applied in order to whole phrases of a subtitle (after the spaces and quotes are
 * normalised). Each phrase must occur in some clip (intro-lines.test.ts), so a stale entry fails.
 */
export const PRONOUNCE: readonly (readonly [phrase: string, spoken: string])[] = [
  ['W, A, S i D', 'wu, a, es i de'],
  ['klawiszem E', 'klawiszem e'],
  ['przyciskiem A', 'przyciskiem a'],
  ['przycisk X', 'przycisk iks'],
  ['klawiszem R', 'klawiszem er'],
  ['przyciskiem RB', 'przyciskiem er be'],
];

/** The words of a subtitle as the voice should say them. */
export function ttsText(subtitle: string): string {
  let text = subtitle
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[„”]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  for (const [phrase, spoken] of PRONOUNCE) {
    text = text.split(phrase).join(spoken);
  }
  return text;
}

export type IntroLine = { subtitle: string; tts: string };

/** Every clip, keyed by id, in scene order. */
export function introLines(): Record<string, IntroLine> {
  return Object.fromEntries(
    INTRO_CLIPS.map((clip) => [clip.id, { subtitle: clip.subtitle, tts: ttsText(clip.subtitle) }]),
  );
}

if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(introLines(), null, 2)}\n`);
}
