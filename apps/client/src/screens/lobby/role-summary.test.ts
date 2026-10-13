import { describe, expect, it } from 'bun:test';
import { getLevel } from '@redakcja/content';
import { ENDLESS_LEVEL_ID, ROLES, type StationKind } from '@redakcja/shared';
import { roleSummary, roleSummaryNote } from './role-summary.ts';

function stationsOf(levelId: string): readonly StationKind[] {
  return getLevel(levelId)?.stations ?? [];
}

const L1 = stationsOf('l1-burza');
const L4 = stationsOf('l4-zdrowie');

describe('roleSummary', () => {
  it('reads the levels the done-when names', () => {
    expect([...L1]).toEqual(['imageSearch', 'sourceRegistry']);
    expect([...L4]).toEqual(['sourceRegistry', 'archive', 'phone', 'dataLibrary']);
  });

  it('a reporter on l1 has neither a useful passive nor a useful ability (no phone)', () => {
    const summary = roleSummary('reporter', L1);
    expect(summary.passive).toBe('Praca o 40% szybciej i Telefon bez kolejki');
    expect(summary.stations).toEqual([]);
    expect(summary.passiveUseful).toBe(false);
    expect(summary.ability).toEqual({
      id: 'fieldCall',
      name: 'Telefon z terenu',
      what: 'pieczątka Telefonu bez chodzenia',
      cooldownS: 60,
      stations: [],
    });
    expect(summary.abilityUseful).toBe(false);
    expect(roleSummaryNote(summary)).toBe('Ta premia nie działa na tym poziomie.');
  });

  it('a photo editor on l4 has no image station for the passive or Ekspertyza', () => {
    const summary = roleSummary('photoEditor', L4);
    expect(summary.passiveUseful).toBe(false);
    expect(summary.abilityUseful).toBe(false);
    expect(summary.stations).toEqual([]);
    expect(summary.ability.stations).toEqual([]);
    expect(roleSummary('photoEditor', L1)).toMatchObject({
      stations: ['imageSearch'],
      passiveUseful: true,
      abilityUseful: true,
      ability: { name: 'Ekspertyza', stations: ['imageSearch'] },
    });
  });

  it('an archivist on l4 is faster at the archive; Ekspertyza covers every document station', () => {
    const summary = roleSummary('archivist', L4);
    expect(summary.stations).toEqual(['archive']);
    expect(summary.ability.stations).toEqual(['archive', 'dataLibrary']);
    expect(roleSummaryNote(summary)).toBeNull();
    const onL1 = roleSummary('archivist', L1);
    expect(onL1.passiveUseful).toBe(false);
    expect(onL1.abilityUseful).toBe(false);
  });

  it('a reporter on l4 has the phone for both perks', () => {
    const summary = roleSummary('reporter', L4);
    expect(summary.stations).toEqual(['phone']);
    expect(summary.passiveUseful).toBe(true);
    expect(summary.abilityUseful).toBe(true);
  });

  it('a generalist is faster everywhere and its Druga szansa works on every level', () => {
    const summary = roleSummary('generalist', L1);
    expect(summary.passive).toBe('Wszędzie praca o 20% szybciej');
    expect(summary.stations).toEqual([]);
    expect(summary.passiveUseful).toBe(true);
    expect(summary.abilityUseful).toBe(true);
    expect(summary.ability.name).toBe('Druga szansa');
    expect(summary.ability.what).toBe('po pudle od razu jeszcze raz');
  });

  it('a rescuer carries Koło ratunkowe and Podaj teczkę', () => {
    const summary = roleSummary('rescuer', L1);
    expect(summary.passive).toBe('Raz ratuje teczkę w ręce (+20 s)');
    expect(summary.ability).toMatchObject({
      id: 'passFolder',
      name: 'Podaj teczkę',
      cooldownS: 60,
    });
    expect(roleSummaryNote(summary)).toBeNull();
  });

  it('a managing editor has no passive to warn about and Przedłużenie everywhere', () => {
    const summary = roleSummary('managingEditor', L1);
    expect(summary.passive).toBeNull();
    expect(summary.passiveUseful).toBe(true);
    expect(summary.ability.what).toBe('+20 s dla teczki w ręce lub najpilniejszej');
    expect(roleSummaryNote(summary)).toBeNull();
  });

  it('every role is fully useful in endless, which has every family and the phone', () => {
    const endless = stationsOf(ENDLESS_LEVEL_ID);
    for (const role of ROLES) {
      const summary = roleSummary(role, endless);
      expect([role, summary.passiveUseful, summary.abilityUseful]).toEqual([role, true, true]);
    }
  });
});
