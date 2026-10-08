import { describe, expect, it } from 'bun:test';
import { addPlayer, canExtendDeadline, createGameState, ROLES, type Role } from '@redakcja/shared';
import { type CrewEntry, DEADLINE_EXTENSION_S, mayExtendDeadline } from './deadline-extension.ts';

const crew = (...roles: (Role | null)[]): CrewEntry[] =>
  roles.map((role, i) => ({ id: `p${i + 1}`, role }));

describe('deadline extension eligibility', () => {
  it('lets only the managing editor extend when someone has the role', () => {
    const team = crew('reporter', 'managingEditor', 'archivist');
    expect(mayExtendDeadline(team, 'p2', false)).toBe(true);
    expect(mayExtendDeadline(team, 'p1', false)).toBe(false);
  });

  it('lets anyone extend when nobody is managing editor and at most three play', () => {
    expect(mayExtendDeadline(crew('reporter', null, 'archivist'), 'p2', false)).toBe(true);
    expect(mayExtendDeadline(crew(null, null, null, 'reporter'), 'p1', false)).toBe(false);
  });

  it('hides the button once the extension is used, for spectators and before welcome', () => {
    expect(mayExtendDeadline(crew('managingEditor'), 'p1', true)).toBe(false);
    expect(mayExtendDeadline(crew('managingEditor'), 'p9', false)).toBe(false);
    expect(mayExtendDeadline(crew('managingEditor'), null, false)).toBe(false);
  });

  it('agrees with the simulation rule for every role mix of 1–4 players', () => {
    const options: (Role | null)[] = [null, ...ROLES];
    for (let size = 1; size <= 4; size++) {
      const combos = options.length ** size;
      for (let n = 0; n < combos; n++) {
        const roles = Array.from(
          { length: size },
          (_, i) => options[Math.floor(n / options.length ** i) % options.length] ?? null,
        );
        const team = crew(...roles);
        let state = createGameState();
        for (const member of team) {
          state = addPlayer(state, member.id, { x: 0, y: 0 }, member.role);
        }
        for (const member of team) {
          expect(mayExtendDeadline(team, member.id, false)).toBe(
            canExtendDeadline(state, member.id),
          );
        }
      }
    }
  });

  it('labels the extension in whole seconds', () => {
    expect(DEADLINE_EXTENSION_S).toBe(20);
  });
});
