// Stand-ins for the roles that carry Druga szansa and Podaj teczkę (S7-38). Wszechstronny and
// Ratownik join `roleSchema` and ROLE_PERKS in S7-43, which deletes this file and runs the same
// tests through the real roles. Until then a test file registers their planned perks for its
// own run and removes them afterwards, so no other test sees them.
import { afterAll, beforeAll } from 'bun:test';
import { ROLE_PERKS, type RolePerk } from '../../constants.ts';
import { type Role, STATION_KINDS } from '../../domain.ts';

/** Wszechstronny: 0.8 at every station, Druga szansa (S7-43's planned row). */
export const GENERALIST = 'generalist' as string as Role;
/** Ratownik: Podaj teczkę and one Koło ratunkowe rescue (S7-43's planned row). */
export const RESCUER = 'rescuer' as string as Role;

const STAND_IN_PERKS: Readonly<Record<string, RolePerk>> = {
  [GENERALIST]: {
    fasterAt: STATION_KINDS,
    workFactor: 0.8,
    ability: 'secondChance',
    expertiseFamily: null,
    skipsPhoneQueue: false,
    rescuesPerLevel: 0,
  },
  [RESCUER]: {
    fasterAt: [],
    workFactor: 1,
    ability: 'passFolder',
    expertiseFamily: null,
    skipsPhoneQueue: false,
    rescuesPerLevel: 1,
  },
};

/** Registers the stand-in roles for the calling test file (call at the top level). */
export function useStandInRoles(): void {
  beforeAll(() => {
    Object.assign(ROLE_PERKS, STAND_IN_PERKS);
  });
  afterAll(() => {
    for (const role of Object.keys(STAND_IN_PERKS)) {
      Reflect.deleteProperty(ROLE_PERKS, role);
    }
  });
}
