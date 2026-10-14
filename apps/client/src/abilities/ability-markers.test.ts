import { describe, expect, it } from 'bun:test';
import type { Ability, CrewSnapshot } from '@redakcja/shared';
import { abilityMarkers, MAX_ABILITY_MARKERS } from './ability-markers.ts';

function member(id: string, fields: Partial<CrewSnapshot> = {}): CrewSnapshot {
  return {
    id,
    abilityReadyAtMs: 0,
    abilityArmed: false,
    fieldCall: null,
    rescuesLeft: 0,
    ...fields,
  };
}

const abilities: Record<string, Ability> = {
  p1: 'expertise',
  p2: 'fieldCall',
  p3: 'passFolder',
  p4: 'secondChance',
};
const abilityOf = (id: string): Ability | null => abilities[id] ?? null;

describe('ability markers (S7-42)', () => {
  it('shows an armed badge and a call bubble whose ring drains with the call', () => {
    const markers = abilityMarkers({
      crew: [
        member('p1', { abilityArmed: true }),
        member('p2', { fieldCall: { folderId: 'f1', endsAtMs: 10_000 } }),
        member('p3'),
        member('p4', { abilityArmed: true }),
      ],
      abilityOf,
      elapsedMs: 7000,
      local: null,
    });
    expect(markers).toEqual([
      { kind: 'armed', playerId: 'p1', ability: 'expertise' },
      { kind: 'call', playerId: 'p2', ring: 0.5 },
      { kind: 'armed', playerId: 'p4', ability: 'secondChance' },
    ]);
  });

  it('clamps the call ring between full and empty', () => {
    const call = (elapsedMs: number) =>
      abilityMarkers({
        crew: [member('p2', { fieldCall: { folderId: 'f1', endsAtMs: 10_000 } })],
        abilityOf,
        elapsedMs,
        local: null,
      });
    expect(call(1000)).toEqual([{ kind: 'call', playerId: 'p2', ring: 1 }]);
    expect(call(12_000)).toEqual([{ kind: 'call', playerId: 'p2', ring: 0 }]);
  });

  it('rings the teammate a ready Podaj teczkę would reach, and only then', () => {
    const crew = [member('p3'), member('p1')];
    const ring = abilityMarkers({
      crew,
      abilityOf,
      elapsedMs: 0,
      local: {
        ability: 'passFolder',
        preview: { kind: 'now', folderId: 'f1', targetPlayerId: 'p1' },
      },
    });
    expect(ring).toEqual([{ kind: 'passTarget', playerId: 'p1' }]);
    for (const preview of [
      { kind: 'blocked', reason: 'noTarget' },
      { kind: 'cooling', readyAtMs: 5000 },
    ] as const) {
      expect(
        abilityMarkers({
          crew,
          abilityOf,
          elapsedMs: 0,
          local: { ability: 'passFolder', preview },
        }),
      ).toEqual([]);
    }
    // Another ability's `now` target is a folder or a station, never a floor ring.
    expect(
      abilityMarkers({
        crew,
        abilityOf,
        elapsedMs: 0,
        local: { ability: 'extendDeadline', preview: { kind: 'now', folderId: 'f1' } },
      }),
    ).toEqual([]);
  });

  it('never draws more than eight markers', () => {
    const crew = Array.from({ length: 12 }, (_, i) => member(`p${i}`, { abilityArmed: true }));
    const markers = abilityMarkers({
      crew,
      abilityOf: () => 'expertise',
      elapsedMs: 0,
      local: null,
    });
    expect(MAX_ABILITY_MARKERS).toBe(8);
    expect(markers).toHaveLength(8);
  });

  it('draws no armed badge for a player without an ability', () => {
    expect(
      abilityMarkers({
        crew: [member('p9', { abilityArmed: true })],
        abilityOf: () => null,
        elapsedMs: 0,
        local: null,
      }),
    ).toEqual([]);
  });
});
