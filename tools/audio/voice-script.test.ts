import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { introLines } from './intro-lines.ts';
import {
  pronunciationHints,
  roughSeconds,
  VOICE_SCRIPT_BEGIN,
  VOICE_SCRIPT_DOC,
  VOICE_SCRIPT_END,
  voiceScriptSection,
  withVoiceScript,
} from './voice-script.ts';

describe('pronunciationHints', () => {
  it('lists every respelled key name of a subtitle, in PRONOUNCE order', () => {
    expect(pronunciationHints('Chodzisz klawiszami W, A, S i D. Weź teczkę klawiszem E.')).toBe(
      '„W, A, S i D” czytaj „wu, a, es i de”; „klawiszem E” czytaj „klawiszem e”',
    );
    expect(pronunciationHints('Zdolność włączasz przyciskiem RB.')).toBe(
      '„przyciskiem RB” czytaj „przyciskiem er be”',
    );
  });

  it('is a dash when nothing needs a hint', () => {
    expect(pronunciationHints('Rozmawiajcie i dzielcie się pracą.')).toBe('—');
  });
});

describe('roughSeconds', () => {
  it('counts 400 ms per word, rounded to whole seconds', () => {
    // 10 words -> 4 s; 16 words -> 6.4 s -> 6 s.
    expect(
      roughSeconds('Rozmawiajcie i dzielcie się pracą. Fioletowy dymek podpowie, co dalej.'),
    ).toBe(4);
    expect(
      roughSeconds(
        'Witaj w redakcji Kuriera Nowobrzeskiego! Jestem naczelnym. Czas goni, a na taśmę ciągle wpadają nowe teczki.',
      ),
    ).toBe(6);
  });
});

describe('voiceScriptSection', () => {
  const section = voiceScriptSection(introLines());
  const rows = section.split('\n').filter((line) => /^\| \d+ \|/.test(line));

  it('has one row per clip, numbered in scene order, with the total', () => {
    expect(rows).toHaveLength(17);
    expect(rows[0]?.startsWith('| 1 | `welcome.wav` | wszyscy |')).toBe(true);
    expect(rows[16]?.startsWith('| 17 | `end.wav` | wszyscy |')).toBe(true);
    expect(section).toContain('Razem 17 plików, około 109 s mowy w spokojnym tempie.');
  });

  it('gives the exact subtitle, who hears it and how to say the keys', () => {
    expect(rows).toContain(
      '| 3 | `pickup.keyboard.wav` | gracze z klawiaturą | Chodzisz klawiszami W, A, S i D. Podejdź do taśmy i weź teczkę klawiszem E. | „W, A, S i D” czytaj „wu, a, es i de”; „klawiszem E” czytaj „klawiszem e” | ok. 6 s |',
    );
    expect(rows).toContain(
      '| 8 | `work.touch.wav` | gracze na telefonie | Zanieś teczkę na stanowisko i przytrzymaj przycisk „Pracuj”. Potem rozwiąż krótkie zadanie. | — | ok. 5 s |',
    );
  });

  it('throws when the line export lacks a clip', () => {
    const { welcome: _dropped, ...rest } = introLines();
    expect(() => voiceScriptSection(rest)).toThrow('line export has no clip welcome');
  });
});

describe('withVoiceScript', () => {
  it('replaces only the text between the markers', () => {
    const doc = `# Doc\n\n${VOICE_SCRIPT_BEGIN}\n\nold table\n\n${VOICE_SCRIPT_END}\n\nAfter.\n`;
    expect(withVoiceScript(doc, 'new table')).toBe(
      `# Doc\n\n${VOICE_SCRIPT_BEGIN}\n\nnew table\n\n${VOICE_SCRIPT_END}\n\nAfter.\n`,
    );
  });

  it('throws without the markers', () => {
    expect(() => withVoiceScript('# Doc\n', 'table')).toThrow('voice-script markers');
  });
});

describe('docs/voice-recording.pl.md', () => {
  const doc = readFileSync(VOICE_SCRIPT_DOC, 'utf8');

  it('holds the current clip table (regenerate with bun tools/audio/voice-script.ts)', () => {
    expect(doc).toBe(withVoiceScript(doc, voiceScriptSection(introLines())));
  });

  it('gives the generator command with the CC0 licence and a credit', () => {
    expect(doc).toContain(
      "python3 tools/audio/synth_voice.py --recordings <folder> --voice <etykieta> --licence self-recorded-CC0 --credit '<imię i nazwisko lub pseudonim>'",
    );
  });
});
