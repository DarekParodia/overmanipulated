// Station help copy (S7-15): every station kind has a purpose, a proof line, 2–3 steps for each
// input device and a real-world line; every line read during play fits in 8 words; every
// registered minigame shows key hints on every device, touch included.
import { describe, expect, it } from 'bun:test';
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { minigames } from '../stations/minigames/index.ts';
import { drawnHints } from '../stations/StationHelpCard.tsx';
import type { InputDevice } from '../store/app.ts';
import { type KeyHint, pl } from './pl.ts';
import { dashes, polishQuotes } from './typography.ts';

const DEVICES: readonly InputDevice[] = ['keyboard', 'gamepad', 'touch'];
const MAX_WORDS = 8;

/** Words a player reads: whitespace-separated tokens with a letter or digit (not „←” or „/”). */
function wordCount(text: string): number {
  return text.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/** Lines shown during play for one station: purpose, proof and every step on every device. */
function playLines(kind: StationKind): string[] {
  const help = pl.stationHelp.kinds[kind];
  return [help.purpose, help.proves, ...DEVICES.flatMap((device) => help.steps[device])];
}

describe('wordCount', () => {
  it('counts words, not arrows, slashes or a lone percent sign', () => {
    expect(wordCount('Margines sięga 50 %? Wybierz „Nie wiem”')).toBe(6);
    expect(wordCount('← i → przewijają, spacja zatrzymuje')).toBe(4);
    expect(wordCount('W i S wybierają, E zakreśla pole')).toBe(7);
  });
});

describe('station help copy', () => {
  it('covers every station kind and nothing else', () => {
    expect(STATION_KINDS.length).toBe(10);
    expect(Object.keys(pl.stationHelp.kinds).sort()).toEqual([...STATION_KINDS].sort());
  });

  it('gives 2–3 non-empty steps for every device', () => {
    for (const kind of STATION_KINDS) {
      for (const device of DEVICES) {
        const steps = pl.stationHelp.kinds[kind].steps[device];
        expect(steps.length, `${kind}/${device}`).toBeGreaterThanOrEqual(2);
        expect(steps.length, `${kind}/${device}`).toBeLessThanOrEqual(3);
        for (const step of steps) {
          expect(step.trim(), `${kind}/${device}`).not.toBe('');
        }
      }
    }
  });

  it('keeps purpose, proof and every step within 8 words', () => {
    for (const kind of STATION_KINDS) {
      for (const line of playLines(kind)) {
        expect(wordCount(line), `${kind}: ${line}`).toBeGreaterThan(0);
        expect(wordCount(line), `${kind}: ${line}`).toBeLessThanOrEqual(MAX_WORDS);
      }
    }
    expect(wordCount(pl.stationHelp.title)).toBeLessThanOrEqual(MAX_WORDS);
    expect(wordCount(pl.stationHelp.proofLabel)).toBe(1);
    // The help card's own lines (S7-94).
    expect(wordCount(pl.stationHelp.got)).toBe(1);
    expect(wordCount(pl.stationHelp.deadlineRuns)).toBe(4);
    for (const kind of STATION_KINDS) {
      const heading = `${pl.stationHelp.title} ${pl.vocab.stations[kind]}`;
      expect(wordCount(heading), heading).toBeLessThanOrEqual(MAX_WORDS);
    }
  });

  it('has a real-world line for every station', () => {
    for (const kind of STATION_KINDS) {
      expect(pl.stationHelp.kinds[kind].realWorld, kind).toMatch(/^\p{Lu}.{20,}\.$/u);
    }
  });

  it('quotes only real on-screen button labels', () => {
    const buttons = new Set<string>([
      pl.minigames.archive.pull,
      pl.minigames.sourceRegistry.file,
      pl.minigames.aiScanner.answers.unsure,
      pl.minigames.dataLibrary.mismatch,
      pl.minigames.metadata.matches,
      pl.minigames.metadata.noData,
    ]);
    const quoted = STATION_KINDS.flatMap((kind) =>
      playLines(kind).flatMap((line) => [...line.matchAll(/„([^”]+)”/g)].map((m) => m[1])),
    );
    expect(quoted.length).toBeGreaterThan(0);
    for (const label of quoted) {
      expect(buttons.has(label ?? ''), label).toBe(true);
    }
  });

  it('is already typeset: Polish quotes and en dashes only', () => {
    for (const kind of STATION_KINDS) {
      const help = pl.stationHelp.kinds[kind];
      for (const line of [...playLines(kind), help.realWorld]) {
        expect(polishQuotes(line), kind).toBe(line);
        expect(dashes(line), kind).toBe(line);
      }
    }
  });
});

describe('minigame key hints', () => {
  // Every station kind with a minigame has its strings (and key hints) under `pl.minigames`.
  const strings: Partial<Record<StationKind, { keys: Record<InputDevice, readonly KeyHint[]> }>> =
    pl.minigames;

  it('exist for every device, touch included, in every registered minigame', () => {
    const registered = STATION_KINDS.filter((kind) => minigames[kind] !== undefined);
    // The six Stage 2–4 minigames and Metadane (S7-52) at least; new stations bring their own
    // hints when they register.
    expect(registered.length).toBeGreaterThanOrEqual(7);
    for (const kind of registered) {
      for (const device of DEVICES) {
        const hints = strings[kind]?.keys[device] ?? [];
        expect(hints.length, `${kind}/${device}`).toBeGreaterThan(0);
        for (const hint of hints) {
          expect(hint.keys.length, `${kind}/${device}`).toBeGreaterThan(0);
          expect(hint.label.trim(), `${kind}/${device}`).not.toBe('');
        }
      }
    }
  });

  it('name the touch gesture or button, never a key', () => {
    expect(strings.imageSearch?.keys.touch).toEqual([
      { keys: ['Stuknij'], label: 'wynik' },
      { keys: ['Przeciągnij'], label: 'lupę' },
    ]);
    expect(strings.archive?.keys.touch.map((hint) => hint.keys[0])).toEqual(['Przesuń', 'Stuknij']);
    expect(strings.dataLibrary?.keys.touch.map((hint) => hint.keys[0])).toEqual([
      'Stuknij',
      pl.minigames.dataLibrary.mismatch,
    ]);
    expect(strings.sourceRegistry?.keys.touch.map((hint) => hint.keys[0])).toEqual([
      'Stuknij',
      pl.minigames.sourceRegistry.file,
    ]);
    expect(strings.metadata?.keys.touch.map((hint) => hint.keys[0])).toEqual([
      'Stuknij',
      pl.minigames.metadata.matches,
    ]);
  });
});

describe('station help card drawing', () => {
  it('draws at most three of the minigame key hints for the device', () => {
    expect(drawnHints('imageSearch', 'keyboard').map((hint) => hint.keys)).toEqual([
      ['Strzałki'],
      ['Spacja'],
      ['Q'],
    ]);
    expect(drawnHints('archive', 'gamepad').map((hint) => hint.keys)).toEqual([['Krzyżak'], ['A']]);
    expect(drawnHints('phone', 'touch').map((hint) => hint.keys)).toEqual([['Stuknij']]);
    for (const kind of STATION_KINDS) {
      for (const device of DEVICES) {
        expect(drawnHints(kind, device).length, `${kind}/${device}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('draws controls for every registered minigame on every device', () => {
    for (const kind of STATION_KINDS.filter((k) => minigames[k] !== undefined)) {
      for (const device of DEVICES) {
        expect(drawnHints(kind, device).length, `${kind}/${device}`).toBeGreaterThan(0);
      }
    }
  });
});
