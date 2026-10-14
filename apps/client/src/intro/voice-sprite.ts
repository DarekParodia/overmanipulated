// The intro voice sprite (S7-100): which part of `/assets/voice/intro.{webm,mp3}` holds each
// narrator clip, who spoke it, under which licence, and the sha1 of the subtitle it was made from.
// `tools/audio/synth_voice.py` writes it next to the audio as `/assets/voice/intro.json`; it is
// never edited by hand. The voice is optional: until the files are generated from the volunteer
// recording (docs/voice-recording.pl.md) there is no sprite, `loadIntroVoice` resolves false and
// the intro runs on subtitles and fallback timing alone.
//
// The sprite is fetched at runtime, not imported: the build cannot import a file that may not
// exist, and the json stays next to the audio it describes and out of the JS bundle.
import { z } from 'zod';
import { loadVoice, type VoiceClips } from '../fx/audio/voice.ts';

/** Where the generator writes the sprite json (beside `VOICE_SOURCES`). */
export const VOICE_SPRITE_URL = '/assets/voice/intro.json';

/** Set by vite.config: whether the build has the sprite. Undefined outside a build (tests). */
declare const __INTRO_VOICE__: boolean | undefined;

/**
 * Whether this build ships the voice (S7-101). False until the volunteer recording is generated:
 * then nothing asks for the sprite, so a missing voice leaves no failed request in the console.
 */
export const VOICE_SHIPPED: boolean = typeof __INTRO_VOICE__ === 'boolean' ? __INTRO_VOICE__ : true;

/**
 * Licences a shipped voice may carry (agents/game-feel.md asset rule). A non-commercial or
 * research-only chain (CC BY-NC, the Blizzard 2013 Lessac licence) has no value here, so the
 * schema rejects a sprite made from one. `self-recorded-CC0` is a volunteer recording released
 * under CC0 (`synth_voice.py --recordings`).
 */
export const VOICE_LICENCES = ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'self-recorded-CC0'] as const;
export type VoiceLicence = (typeof VOICE_LICENCES)[number];

/** Each of `intro.webm` and `intro.mp3` must stay at or under this many bytes. */
export const VOICE_MAX_BYTES = 700_000;

const clipSchema = z.strictObject({
  startMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  /** sha1 (hex) of `voiceText(subtitle)` at generation time; voice-sync.test.ts compares it. */
  textSha1: z.string().regex(/^[0-9a-f]{40}$/),
});

export const voiceSpriteSchema = z.strictObject({
  /** The engine voice (`pl_PL-…`) or the volunteer's label for a recording. */
  voice: z.string().min(1),
  source: z.enum(['tts', 'recording']),
  licence: z.enum(VOICE_LICENCES),
  /** Attribution line for CREDITS.md; required by CC-BY-4.0, optional otherwise. */
  credit: z.string().min(1).optional(),
  clips: z.record(z.string().min(1), clipSchema),
});
export type VoiceSprite = z.infer<typeof voiceSpriteSchema>;

/**
 * The words a clip's audio was made from, as hashed: NFC, every run of whitespace (non-breaking
 * spaces included) collapsed to one plain space, trimmed. Typographic spacing changes do not make
 * a clip stale; any change to the words does.
 */
export function voiceText(subtitle: string): string {
  return subtitle
    .normalize('NFC')
    .replace(/\s+/g, ' ') // `\s` covers U+00A0 and U+202F
    .trim();
}

/** The clip table `loadVoice` takes. */
export function voiceClips(sprite: VoiceSprite): VoiceClips {
  return Object.fromEntries(
    Object.entries(sprite.clips).map(([id, clip]) => [
      id,
      { startMs: clip.startMs, durationMs: clip.durationMs },
    ]),
  );
}

export type FetchJson = (url: string) => Promise<unknown>;

const fetchJson: FetchJson = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    return null;
  }
  return response.json();
};

/**
 * The sprite, or null when there is none: not generated yet (404, or the dev server's html
 * fallback), unreadable, or not valid against the schema. Never throws.
 */
export async function loadVoiceSprite(get: FetchJson = fetchJson): Promise<VoiceSprite | null> {
  try {
    const parsed = voiceSpriteSchema.safeParse(await get(VOICE_SPRITE_URL));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** `loadVoiceSprite`, or null at once when the build ships no voice (`VOICE_SHIPPED`). */
export function loadShippedVoiceSprite(
  get: FetchJson = fetchJson,
  shipped: boolean = VOICE_SHIPPED,
): Promise<VoiceSprite | null> {
  return shipped ? loadVoiceSprite(get) : Promise.resolve(null);
}

/**
 * Fetches the sprite, then the audio (once). Resolves false when the voice cannot play: no
 * sprite, or the audio did not load in time. The intro keeps its fallback timing either way.
 */
export async function loadIntroVoice(
  get: FetchJson = fetchJson,
  load: (clips: VoiceClips) => Promise<boolean> = loadVoice,
): Promise<boolean> {
  const sprite = await loadVoiceSprite(get);
  return sprite === null ? false : load(voiceClips(sprite));
}
