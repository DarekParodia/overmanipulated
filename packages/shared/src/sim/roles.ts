// Role perks (S7-36): the passive work bonus, the active ability and the crew's ability state as
// the snapshot carries it. Pure lookups over ROLE_PERKS and STATION_FAMILY in constants.ts.
import { ABILITY, ROLE_PERKS, STATION_FAMILY } from '../constants.ts';
import {
  type Ability,
  type Role,
  STATION_KINDS,
  type StationFamily,
  type StationKind,
} from '../domain.ts';
import type { CrewSnapshot } from '../protocol.ts';
import type { CrewMember, GameState } from './state.ts';

/** The role's active ability; null without a role. */
export function abilityOf(role: Role | null): Ability | null {
  return role ? ROLE_PERKS[role].ability : null;
}

/**
 * Hold-to-work multiplier for a role at a station kind: the role's `workFactor` at its
 * `fasterAt` stations, 1 elsewhere and without a role. The difficulty's factor comes on top.
 */
export function roleWorkFactor(role: Role | null, kind: StationKind): number {
  if (!role) {
    return 1;
  }
  const perk = ROLE_PERKS[role];
  return (perk.fasterAt as readonly StationKind[]).includes(kind) ? perk.workFactor : 1;
}

/**
 * Whether the role's Ekspertyza covers a station kind: the role has Ekspertyza and the kind
 * belongs to the role's family (photo editor: image, archivist: documents). Families gate
 * Ekspertyza only; passives keep their explicit lists.
 */
export function expertiseCovers(role: Role | null, kind: StationKind): boolean {
  if (!role || ROLE_PERKS[role].ability !== 'expertise') {
    return false;
  }
  return ROLE_PERKS[role].expertiseFamily === STATION_FAMILY[kind];
}

/** The station kinds of a family, in `STATION_KINDS` order (lobby, cards, the Ekspertyza HUD). */
export function familyStations(family: StationFamily): StationKind[] {
  return STATION_KINDS.filter((kind) => STATION_FAMILY[kind] === family);
}

/**
 * The ability's effect happened: the member is disarmed and the cooldown starts at `elapsedMs`.
 * Returns the same crew when the player has no crew member.
 */
export function spendAbility(
  crew: Record<string, CrewMember>,
  playerId: string,
  ability: Ability,
  elapsedMs: number,
): Record<string, CrewMember> {
  const member = crew[playerId];
  if (!member) {
    return crew;
  }
  return {
    ...crew,
    [playerId]: {
      ...member,
      abilityArmed: false,
      abilityReadyAtMs: elapsedMs + ABILITY[ability].cooldownMs,
    },
  };
}

/** Every player's ability state for the snapshot, in join order. */
export function crewSnapshot(state: GameState): CrewSnapshot[] {
  const crew: CrewSnapshot[] = [];
  for (const id of Object.keys(state.players)) {
    const member = state.crew[id];
    if (!member) {
      continue;
    }
    crew.push({
      id,
      abilityReadyAtMs: member.abilityReadyAtMs,
      abilityArmed: member.abilityArmed,
      fieldCall: member.fieldCall,
      rescuesLeft: member.rescuesLeft,
    });
  }
  return crew;
}
