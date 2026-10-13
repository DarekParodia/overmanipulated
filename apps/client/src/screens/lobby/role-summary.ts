// What a role does on the chosen level (S7-44), for the lobby's detail panel: the passive with
// the stations it speeds up there, the active ability with its cooldown and the stations it
// covers there, and whether each perk does anything on this level at all. Pure: every number
// comes from ROLE_PERKS / ABILITY / STATION_FAMILY, so the panel never contradicts the sim.
import {
  ABILITY,
  type Ability,
  RESCUE_ADD_MS,
  ROLE_PERKS,
  type Role,
  STATION_FAMILY,
  STATION_KINDS,
  type StationKind,
} from '@redakcja/shared';
import { pl } from '../../strings/pl.ts';
import { listPl } from '../../strings/plural.ts';

export type RoleSummary = {
  role: Role;
  /** The passive in one line; null for a role without one (Redaktor prowadzący). */
  passive: string | null;
  /** Stations on this level where the passive speeds the work up (chips; none for „Wszędzie”). */
  stations: StationKind[];
  ability: {
    id: Ability;
    name: string;
    what: string;
    cooldownS: number;
    /** Stations on this level the ability covers (Ekspertyza's family; none for the others). */
    stations: StationKind[];
  };
  /** False only when the role has a passive and it does nothing on this level. */
  passiveUseful: boolean;
  /** False when the ability can never act on this level (no phone, no family station). */
  abilityUseful: boolean;
};

const onLevel = (
  stations: readonly StationKind[],
  levelStations: readonly StationKind[],
): StationKind[] => stations.filter((station) => levelStations.includes(station));

function everyStation(stations: readonly StationKind[]): boolean {
  return STATION_KINDS.every((kind) => stations.includes(kind));
}

function passiveLine(role: Role): string | null {
  const perk = ROLE_PERKS[role];
  if (perk.rescuesPerLevel > 0) {
    return pl.lobbyRoles.rescuePassive(RESCUE_ADD_MS / 1000);
  }
  if (perk.fasterAt.length === 0) {
    return perk.skipsPhoneQueue ? pl.lobbyRoles.phoneQueue : null;
  }
  const percent = Math.round((1 - perk.workFactor) * 100);
  if (everyStation(perk.fasterAt)) {
    return pl.lobbyRoles.everywhereFaster(percent);
  }
  const faster = pl.lobbyRoles.fasterPassive(percent);
  return perk.skipsPhoneQueue ? listPl([faster, pl.lobbyRoles.phoneQueue]) : faster;
}

function abilityStations(role: Role, levelStations: readonly StationKind[]): StationKind[] {
  const family = ROLE_PERKS[role].expertiseFamily;
  if (family === null) {
    return [];
  }
  return levelStations.filter((station) => STATION_FAMILY[station] === family);
}

export function roleSummary(role: Role, levelStations: readonly StationKind[]): RoleSummary {
  const perk = ROLE_PERKS[role];
  const everywhere = everyStation(perk.fasterAt);
  const fasterHere = onLevel(perk.fasterAt, levelStations);
  const passive = passiveLine(role);
  const phoneHere = levelStations.includes('phone');
  const passiveUseful =
    passive === null ||
    perk.rescuesPerLevel > 0 ||
    fasterHere.length > 0 ||
    (perk.skipsPhoneQueue && phoneHere);
  const covered = abilityStations(role, levelStations);
  const abilityUseful =
    perk.ability === 'expertise'
      ? covered.length > 0
      : perk.ability === 'fieldCall'
        ? phoneHere
        : true;
  return {
    role,
    passive,
    stations: everywhere ? [] : fasterHere,
    ability: {
      id: perk.ability,
      name: pl.vocab.abilities[perk.ability],
      what: pl.lobbyRoles.abilityWhat[role],
      cooldownS: Math.round(ABILITY[perk.ability].cooldownMs / 1000),
      stations: covered,
    },
    passiveUseful,
    abilityUseful,
  };
}

/** The note under the panel: the passive's first, else the ability's; null when both work. */
export function roleSummaryNote(summary: RoleSummary): string | null {
  if (!summary.passiveUseful) {
    return pl.lobbyRoles.passiveNotHere;
  }
  return summary.abilityUseful ? null : pl.lobbyRoles.abilityNotHere;
}
