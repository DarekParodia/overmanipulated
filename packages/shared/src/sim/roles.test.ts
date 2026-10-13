import { describe, expect, it } from 'bun:test';
import { NORMAL_TUNING } from '../difficulty.ts';
import { TEST_MAP } from './__fixtures__/greybox.ts';
import {
  abilityOf,
  crewSnapshot,
  expertiseCovers,
  familyStations,
  roleWorkFactor,
} from './roles.ts';
import { addPlayer, createGameState } from './state.ts';
import { workDurationMs } from './stations.ts';

function crewOf(...roles: Parameters<typeof addPlayer>[3][]) {
  let state = createGameState({ map: TEST_MAP, seed: 3 });
  roles.forEach((role, index) => {
    state = addPlayer(state, `p${index + 1}`, { x: 2.5 + index, y: 2.5 }, role);
  });
  return state;
}

describe('role passives (ROLE_PERKS)', () => {
  const state = crewOf(
    'photoEditor',
    'archivist',
    'reporter',
    'managingEditor',
    null,
    'generalist',
    'rescuer',
  );
  const work = (playerId: string, kind: Parameters<typeof workDurationMs>[2]) =>
    workDurationMs(state, playerId, kind, NORMAL_TUNING);

  it('keeps the work times of the Stage 6 role bonuses', () => {
    expect(work('p1', 'imageSearch')).toBe(2400);
    expect(work('p1', 'aiScanner')).toBe(1800);
    expect(work('p2', 'archive')).toBe(3000);
    expect(work('p3', 'phone')).toBe(3600);
  });

  it('speeds each role up at the Stage 7 stations of its craft (S7-48)', () => {
    expect(work('p1', 'geolocation')).toBe(2400);
    expect(work('p1', 'metadata')).toBe(2400);
    expect(work('p2', 'transcript')).toBe(3000);
    expect(work('p3', 'crossCheck')).toBe(2400);
    expect(work('p1', 'transcript')).toBe(5000);
    expect(work('p2', 'crossCheck')).toBe(4000);
    expect(work('p3', 'geolocation')).toBe(4000);
    expect(work('p4', 'metadata')).toBe(4000);
    expect(work('p5', 'transcript')).toBe(5000);
  });

  it('gives no bonus outside the role’s own stations', () => {
    expect(work('p3', 'sourceRegistry')).toBe(4000);
    expect(work('p2', 'dataLibrary')).toBe(5000);
    expect(work('p1', 'archive')).toBe(5000);
    expect(work('p4', 'imageSearch')).toBe(4000);
    expect(work('p5', 'phone')).toBe(6000);
  });

  it('makes Wszechstronny 20% faster at every station and Ratownik not faster', () => {
    expect(work('p6', 'imageSearch')).toBe(3200);
    expect(work('p6', 'phone')).toBe(4800);
    expect(work('p6', 'archive')).toBe(4000);
    expect(work('p6', 'aiScanner')).toBe(2400);
    expect(work('p6', 'metadata')).toBe(3200);
    expect(work('p7', 'imageSearch')).toBe(4000);
    expect(work('p7', 'phone')).toBe(6000);
  });

  it('reads the factor per role and kind', () => {
    expect(roleWorkFactor('generalist', 'phone')).toBe(0.8);
    expect(roleWorkFactor('rescuer', 'archive')).toBe(1);
    expect(roleWorkFactor('photoEditor', 'imageSearch')).toBe(0.6);
    expect(roleWorkFactor('managingEditor', 'phone')).toBe(1);
    expect(roleWorkFactor(null, 'archive')).toBe(1);
  });
});

describe('role abilities', () => {
  it('maps every role to its ability', () => {
    expect(abilityOf('photoEditor')).toBe('expertise');
    expect(abilityOf('archivist')).toBe('expertise');
    expect(abilityOf('reporter')).toBe('fieldCall');
    expect(abilityOf('managingEditor')).toBe('extendDeadline');
    expect(abilityOf('generalist')).toBe('secondChance');
    expect(abilityOf('rescuer')).toBe('passFolder');
    expect(abilityOf(null)).toBeNull();
  });

  it('gates Ekspertyza by station family only', () => {
    expect(expertiseCovers('photoEditor', 'imageSearch')).toBe(true);
    expect(expertiseCovers('photoEditor', 'aiScanner')).toBe(true);
    expect(expertiseCovers('photoEditor', 'archive')).toBe(false);
    expect(expertiseCovers('archivist', 'archive')).toBe(true);
    expect(expertiseCovers('archivist', 'dataLibrary')).toBe(true);
    expect(expertiseCovers('archivist', 'phone')).toBe(false);
    expect(expertiseCovers('reporter', 'phone')).toBe(false);
    expect(expertiseCovers('photoEditor', 'geolocation')).toBe(true);
    expect(expertiseCovers('photoEditor', 'metadata')).toBe(true);
    expect(expertiseCovers('archivist', 'transcript')).toBe(true);
    expect(expertiseCovers('archivist', 'crossCheck')).toBe(false);
    expect(expertiseCovers(null, 'imageSearch')).toBe(false);
    expect(expertiseCovers('generalist', 'imageSearch')).toBe(false);
    expect(expertiseCovers('rescuer', 'archive')).toBe(false);
  });

  it('lists the stations of each family', () => {
    expect(familyStations('image')).toEqual([
      'imageSearch',
      'aiScanner',
      'geolocation',
      'metadata',
    ]);
    expect(familyStations('documents')).toEqual(['archive', 'dataLibrary', 'transcript']);
    expect(familyStations('sources')).toEqual(['sourceRegistry', 'phone', 'crossCheck']);
  });
});

describe('crew ability state', () => {
  it('starts ready, unarmed, with no call and no rescues', () => {
    const state = crewOf('managingEditor');
    expect(state.crew.p1).toEqual({
      role: 'managingEditor',
      workHeld: false,
      lastPingMs: Number.NEGATIVE_INFINITY,
      abilityReadyAtMs: 0,
      abilityArmed: false,
      fieldCall: null,
      rescuesLeft: 0,
    });
  });

  it('gives a Ratownik one rescue per level', () => {
    expect(crewOf('rescuer').crew.p1?.rescuesLeft).toBe(1);
    expect(crewOf('generalist').crew.p1?.rescuesLeft).toBe(0);
  });

  it('makes a mid-game joiner’s ability ready at once', () => {
    const state = addPlayer({ ...crewOf('reporter'), elapsedMs: 42_000 }, 'p9', { x: 3, y: 3 });
    expect(state.crew.p9?.abilityReadyAtMs).toBe(42_000);
  });

  it('lists the crew for the snapshot in join order, without roles', () => {
    expect(crewSnapshot(crewOf('reporter', null))).toEqual([
      { id: 'p1', abilityReadyAtMs: 0, abilityArmed: false, fieldCall: null, rescuesLeft: 0 },
      { id: 'p2', abilityReadyAtMs: 0, abilityArmed: false, fieldCall: null, rescuesLeft: 0 },
    ]);
  });
});
