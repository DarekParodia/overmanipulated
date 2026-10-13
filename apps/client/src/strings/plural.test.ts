import { describe, expect, it } from 'bun:test';
import { pl } from './pl.ts';
import { pluralPl } from './plural.ts';

const folders = (n: number) => pluralPl(n, 'teczka', 'teczki', 'teczek');

describe('pluralPl', () => {
  it('uses the singular for exactly one', () => {
    expect(folders(1)).toBe('teczka');
    expect(folders(-1)).toBe('teczka');
  });

  it('uses the "few" form for 2–4, 22–24, 102–104', () => {
    expect([2, 3, 4, 22, 23, 24, 32, 102, 104].map(folders)).toEqual(
      Array(9).fill('teczki') as string[],
    );
  });

  it('uses the "many" form for 0, 5–21, 25–31, 111–114 and 1001', () => {
    expect([0, 5, 9, 11, 12, 13, 14, 15, 21, 25, 31, 111, 112, 114, 1001].map(folders)).toEqual(
      Array(15).fill('teczek') as string[],
    );
  });

  it('drives the counted strings that used to inline the rule', () => {
    expect(pl.lobbyRoles.levelFolders(1)).toBe('1 teczka');
    expect(pl.lobbyRoles.levelFolders(14)).toBe('14 teczek');
    expect(pl.lobbyRoles.levelFolders(24)).toBe('24 teczki');
    expect(pl.debrief.count(1)).toBe('1 teczka');
    expect(pl.debrief.count(3)).toBe('3 teczki');
    expect(pl.debrief.count(12)).toBe('12 teczek');
    expect(pl.debrief.votes(1)).toBe('1 głos');
    expect(pl.debrief.votes(2)).toBe('2 głosy');
    expect(pl.debrief.votes(5)).toBe('5 głosów');
    expect(pl.debrief.votes(22)).toBe('22 głosy');
  });
});
