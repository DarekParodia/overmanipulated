// Keeps the generated intro voice in step with the script (S7-100). The voice is optional: with
// no sprite json the intro runs on subtitles and fallback timing, and this test only checks that
// no orphaned audio ships. Once `tools/audio/synth_voice.py` has written the files, every clip of
// the script must be in the sprite, made from the current words (sha1), and both audio files must
// fit the size cap.
import { describe, expect, it } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INTRO_CLIPS } from './intro-script.ts';
import { VOICE_LICENCES, VOICE_MAX_BYTES, voiceSpriteSchema, voiceText } from './voice-sprite.ts';

const REGENERATE = 'run python3 tools/audio/synth_voice.py';

type ScriptClip = { id: string; subtitle: string };

function sha1(subtitle: string): string {
  return createHash('sha1').update(voiceText(subtitle), 'utf8').digest('hex');
}

/** Every reason the sprite does not match the script; empty when it does. */
function voiceSyncProblems(
  json: unknown,
  script: readonly ScriptClip[],
  audioBytes: Readonly<Record<'webm' | 'mp3', number | null>>,
): string[] {
  const parsed = voiceSpriteSchema.safeParse(json);
  if (!parsed.success) {
    return [`voice sprite json is invalid (${parsed.error.issues.length} issues): ${REGENERATE}`];
  }
  const sprite = parsed.data;
  const problems: string[] = [];
  for (const clip of script) {
    const entry = sprite.clips[clip.id];
    if (!entry) {
      problems.push(`clip ${clip.id} missing: ${REGENERATE}`);
    } else if (entry.textSha1 !== sha1(clip.subtitle)) {
      problems.push(`clip ${clip.id} out of date: ${REGENERATE}`);
    }
  }
  const known = new Set(script.map((clip) => clip.id));
  for (const id of Object.keys(sprite.clips)) {
    if (!known.has(id)) {
      problems.push(`clip ${id} is not in the script: ${REGENERATE}`);
    }
  }
  const spans = Object.entries(sprite.clips).sort(([, a], [, b]) => a.startMs - b.startMs);
  for (let i = 1; i < spans.length; i += 1) {
    const [prevId, prev] = spans[i - 1] ?? ['', { startMs: 0, durationMs: 0 }];
    const [id, clip] = spans[i] ?? ['', { startMs: 0, durationMs: 0 }];
    if (prev.startMs + prev.durationMs > clip.startMs) {
      problems.push(`clips ${prevId} and ${id} overlap`);
    }
  }
  if (sprite.licence === 'CC-BY-4.0' && sprite.credit === undefined) {
    problems.push('a CC-BY-4.0 voice needs its credit line');
  }
  for (const ext of ['webm', 'mp3'] as const) {
    const bytes = audioBytes[ext];
    if (bytes === null) {
      problems.push(`intro.${ext} missing: ${REGENERATE}`);
    } else if (bytes > VOICE_MAX_BYTES) {
      problems.push(`intro.${ext} is ${bytes} bytes, over ${VOICE_MAX_BYTES}`);
    }
  }
  return problems;
}

const SCRIPT: readonly ScriptClip[] = [
  { id: 'welcome', subtitle: 'Witaj w redakcji.' },
  { id: 'end', subtitle: 'Do roboty!' },
];

function fixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    voice: 'volunteer-a',
    source: 'recording',
    licence: 'self-recorded-CC0',
    clips: {
      welcome: { startMs: 0, durationMs: 1500, textSha1: sha1('Witaj w redakcji.') },
      end: { startMs: 1620, durationMs: 900, textSha1: sha1('Do roboty!') },
    },
    ...overrides,
  };
}

const FITS = { webm: 300_000, mp3: 520_000 } as const;

describe('voice sync check', () => {
  it('accepts a sprite made from the current words', () => {
    expect(voiceSyncProblems(fixture(), SCRIPT, FITS)).toEqual([]);
  });

  it('flags a clip whose words changed since generation', () => {
    const stale = fixture({
      clips: {
        welcome: { startMs: 0, durationMs: 1500, textSha1: sha1('Witaj w nowej redakcji.') },
        end: { startMs: 1620, durationMs: 900, textSha1: sha1('Do roboty!') },
      },
    });
    expect(voiceSyncProblems(stale, SCRIPT, FITS)).toEqual([
      'clip welcome out of date: run python3 tools/audio/synth_voice.py',
    ]);
  });

  it('flags missing and unknown clips, overlaps and invalid json', () => {
    const shuffled = fixture({
      clips: {
        welcome: { startMs: 0, durationMs: 1700, textSha1: sha1('Witaj w redakcji.') },
        bonus: { startMs: 1620, durationMs: 900, textSha1: sha1('Do roboty!') },
      },
    });
    expect(voiceSyncProblems(shuffled, SCRIPT, FITS)).toEqual([
      'clip end missing: run python3 tools/audio/synth_voice.py',
      'clip bonus is not in the script: run python3 tools/audio/synth_voice.py',
      'clips welcome and bonus overlap',
    ]);
    expect(voiceSyncProblems({ clips: {} }, SCRIPT, FITS)[0]).toStartWith(
      'voice sprite json is invalid',
    );
  });

  it('caps both audio files at 700 000 bytes and requires both', () => {
    expect(voiceSyncProblems(fixture(), SCRIPT, { webm: 700_000, mp3: 700_001 })).toEqual([
      'intro.mp3 is 700001 bytes, over 700000',
    ]);
    expect(voiceSyncProblems(fixture(), SCRIPT, { webm: null, mp3: 500_000 })).toEqual([
      'intro.webm missing: run python3 tools/audio/synth_voice.py',
    ]);
  });

  it('asks a CC-BY-4.0 voice for its credit line', () => {
    expect(voiceSyncProblems(fixture({ licence: 'CC-BY-4.0' }), SCRIPT, FITS)).toEqual([
      'a CC-BY-4.0 voice needs its credit line',
    ]);
    const credited = fixture({ licence: 'CC-BY-4.0', credit: 'Voice: A. Example, CC BY 4.0' });
    expect(voiceSyncProblems(credited, SCRIPT, FITS)).toEqual([]);
  });
});

const VOICE_DIR = fileURLToPath(new URL('../../public/assets/voice/', import.meta.url));

function bytesOf(name: string): number | null {
  const path = `${VOICE_DIR}${name}`;
  return existsSync(path) ? statSync(path).size : null;
}

describe('shipped intro voice', () => {
  const spritePath = `${VOICE_DIR}intro.json`;

  it('matches the intro script, or is absent together with its audio', () => {
    const audio = { webm: bytesOf('intro.webm'), mp3: bytesOf('intro.mp3') };
    if (!existsSync(spritePath)) {
      // Not generated yet: the intro runs on subtitles and fallback timing. Audio without its
      // sprite could never play, so it must not ship either.
      expect(audio).toEqual({ webm: null, mp3: null });
      return;
    }
    const json: unknown = JSON.parse(readFileSync(spritePath, 'utf8'));
    expect(voiceSyncProblems(json, INTRO_CLIPS, audio)).toEqual([]);
  });

  it('uses the same size cap and licences as the generator', () => {
    const tool = readFileSync(
      fileURLToPath(new URL('../../../../tools/audio/synth_voice.py', import.meta.url)),
      'utf8',
    );
    expect(VOICE_MAX_BYTES).toBe(700_000);
    expect(tool).toContain('VOICE_MAX_BYTES = 700_000');
    expect(tool).toContain('LICENCES = ("CC0-1.0", "CC-BY-4.0", "MIT", "self-recorded-CC0")');
    expect(VOICE_LICENCES).toEqual(['CC0-1.0', 'CC-BY-4.0', 'MIT', 'self-recorded-CC0']);
  });
});
