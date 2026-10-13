import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { INTRO_CLIPS } from '../../apps/client/src/intro/intro-script.ts';
import { introLines, PRONOUNCE, ttsText } from './intro-lines.ts';

describe('ttsText', () => {
  it('drops non-breaking spaces and Polish quotes, and respells key names', () => {
    expect(ttsText('Weź teczkę klawiszem E i\u00a0wciśnij „Podnieś”.')).toBe(
      'Weź teczkę klawiszem e i wciśnij Podnieś.',
    );
    expect(ttsText('Chodzisz klawiszami W, A, S i\u00a0D.')).toBe(
      'Chodzisz klawiszami wu, a, es i de.',
    );
    expect(ttsText('Zdolność włączasz przyciskiem RB, a\u00a0potem…')).toBe(
      'Zdolność włączasz przyciskiem er be, a potem…',
    );
  });
});

describe('intro line export', () => {
  const lines = introLines();

  it('prints 17 clips in scene order', () => {
    expect(Object.keys(lines)).toHaveLength(17);
    expect(Object.keys(lines)).toEqual(INTRO_CLIPS.map((clip) => clip.id));
  });

  it('keeps the subtitle as is and speaks the respelled text', () => {
    expect(lines['roles.keyboard']).toEqual({
      subtitle:
        'Każdy może wybrać rolę. Rola daje premię i\u00a0zdolność, na przykład Ekspertyzę. Zdolność włączasz klawiszem R, a\u00a0potem musi się odnowić.',
      tts: 'Każdy może wybrać rolę. Rola daje premię i zdolność, na przykład Ekspertyzę. Zdolność włączasz klawiszem er, a potem musi się odnowić.',
    });
  });

  it('uses every respelling and leaves no bare key name to the voice', () => {
    for (const [phrase] of PRONOUNCE) {
      expect(
        INTRO_CLIPS.some((clip) => clip.subtitle.replace(/\u00a0/g, ' ').includes(phrase)),
        phrase,
      ).toBe(true);
    }
    for (const [id, line] of Object.entries(lines)) {
      expect(line.tts, id).not.toMatch(/[\u00a0„”]/);
      // Key caps the game uses: E, Q, R, X, Y, RB, Spacja; a capital alone is read unreliably.
      expect(line.tts, id).not.toMatch(/(?<!\p{L})(?:[EQRXY]|RB|LB)(?!\p{L})/u);
    }
  });

  it('prints JSON on stdout and writes no file', () => {
    const run = Bun.spawnSync(['bun', join(import.meta.dir, 'intro-lines.ts')]);
    expect(run.exitCode).toBe(0);
    const printed: unknown = JSON.parse(run.stdout.toString());
    expect(printed).toEqual(lines);
  });
});
