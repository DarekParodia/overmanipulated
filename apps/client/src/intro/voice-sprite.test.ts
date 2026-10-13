import { describe, expect, it } from 'bun:test';
import type { VoiceClips } from '../fx/audio/voice.ts';
import {
  loadIntroVoice,
  loadVoiceSprite,
  VOICE_LICENCES,
  VOICE_SPRITE_URL,
  voiceClips,
  voiceSpriteSchema,
  voiceText,
} from './voice-sprite.ts';

const SHA = 'c88fd2c298946d021ddb285e81eb1f04e28d1fcb';

const SPRITE = {
  voice: 'volunteer-a',
  source: 'recording',
  licence: 'self-recorded-CC0',
  clips: {
    welcome: { startMs: 0, durationMs: 4210, textSha1: SHA },
    'pickup.touch': { startMs: 4330, durationMs: 5120, textSha1: SHA },
  },
};

describe('voiceSpriteSchema', () => {
  it('accepts the four allowed licences', () => {
    expect(VOICE_LICENCES).toEqual(['CC0-1.0', 'CC-BY-4.0', 'MIT', 'self-recorded-CC0']);
    for (const licence of VOICE_LICENCES) {
      expect(voiceSpriteSchema.safeParse({ ...SPRITE, licence }).success, licence).toBe(true);
    }
  });

  it('rejects a non-commercial or research-only voice', () => {
    for (const licence of ['CC-BY-NC', 'CC-BY-NC-4.0', 'CC-BY-NC-SA-4.0', 'Blizzard-2013', '']) {
      expect(voiceSpriteSchema.safeParse({ ...SPRITE, licence }).success, licence).toBe(false);
    }
    const { licence: _dropped, ...unlicensed } = SPRITE;
    expect(voiceSpriteSchema.safeParse(unlicensed).success).toBe(false);
  });

  it('rejects bad clips and unknown fields', () => {
    const clip = { startMs: 0, durationMs: 4210, textSha1: SHA };
    const withClip = (value: unknown) => ({ ...SPRITE, clips: { welcome: value } });
    expect(voiceSpriteSchema.safeParse(withClip(clip)).success).toBe(true);
    expect(voiceSpriteSchema.safeParse(withClip({ ...clip, durationMs: 0 })).success).toBe(false);
    expect(voiceSpriteSchema.safeParse(withClip({ ...clip, startMs: -1 })).success).toBe(false);
    expect(voiceSpriteSchema.safeParse(withClip({ ...clip, startMs: 1.5 })).success).toBe(false);
    expect(voiceSpriteSchema.safeParse(withClip({ ...clip, textSha1: 'abc' })).success).toBe(false);
    expect(voiceSpriteSchema.safeParse({ ...SPRITE, source: 'video' }).success).toBe(false);
    expect(voiceSpriteSchema.safeParse({ ...SPRITE, extra: 1 }).success).toBe(false);
  });
});

describe('voiceText', () => {
  it('collapses every kind of space and keeps the words', () => {
    expect(voiceText(' Weź teczkę i idź.\n')).toBe('Weź teczkę i idź.');
    expect(voiceText('ż')).toBe('ż');
  });
});

describe('voiceClips', () => {
  it('keeps only the timing loadVoice needs', () => {
    const sprite = voiceSpriteSchema.parse(SPRITE);
    expect(voiceClips(sprite)).toEqual({
      welcome: { startMs: 0, durationMs: 4210 },
      'pickup.touch': { startMs: 4330, durationMs: 5120 },
    });
  });
});

describe('loadVoiceSprite / loadIntroVoice', () => {
  const loads: VoiceClips[] = [];
  const load = (clips: VoiceClips) => {
    loads.push(clips);
    return Promise.resolve(true);
  };

  it('fetches the sprite next to the audio', async () => {
    const urls: string[] = [];
    const sprite = await loadVoiceSprite((url) => {
      urls.push(url);
      return Promise.resolve(SPRITE);
    });
    expect(urls).toEqual(['/assets/voice/intro.json']);
    expect(VOICE_SPRITE_URL).toBe('/assets/voice/intro.json');
    expect(sprite?.voice).toBe('volunteer-a');
  });

  it('runs without a voice when no sprite was generated', async () => {
    loads.length = 0;
    // 404, the dev server's html fallback (json parse error), invalid json, a network error.
    const misses = [
      () => Promise.resolve(null),
      () => Promise.reject(new SyntaxError('Unexpected token <')),
      () => Promise.resolve({ ...SPRITE, licence: 'CC-BY-NC' }),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ];
    for (const miss of misses) {
      expect(await loadVoiceSprite(miss)).toBeNull();
      expect(await loadIntroVoice(miss, load)).toBe(false);
    }
    expect(loads).toEqual([]);
  });

  it('loads the audio with the clip table when the sprite is there', async () => {
    loads.length = 0;
    expect(await loadIntroVoice(() => Promise.resolve(SPRITE), load)).toBe(true);
    expect(loads).toEqual([
      {
        welcome: { startMs: 0, durationMs: 4210 },
        'pickup.touch': { startMs: 4330, durationMs: 5120 },
      },
    ]);
    const failed = await loadIntroVoice(
      () => Promise.resolve(SPRITE),
      () => Promise.resolve(false),
    );
    expect(failed).toBe(false);
  });
});
