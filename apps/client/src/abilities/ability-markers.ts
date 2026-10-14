// Which ability markers float over the players in the world (S7-42), from the snapshot's crew
// and the local ability preview. Pure; abilities/AbilityMarkers.tsx draws them.
// - armed: Ekspertyza or Druga szansa waits armed (a blue ring with the ability icon);
// - call: Telefon z terenu is dialling (a phone in an orange ring that drains with the call);
// - passTarget: the teammate the local Ratownik's Podaj teczkę would reach now (a dashed ring on
//   the floor under them).
import { ABILITY, type Ability, type AbilityPreview, type CrewSnapshot } from '@redakcja/shared';

/** At most this many markers (4 players: one head marker each plus the pass target). */
export const MAX_ABILITY_MARKERS = 8;

export type AbilityMarker =
  | { kind: 'armed'; playerId: string; ability: Ability }
  /** `ring`: the share of the call still to go, 1 → 0. */
  | { kind: 'call'; playerId: string; ring: number }
  | { kind: 'passTarget'; playerId: string };

export type AbilityMarkerInput = {
  crew: readonly CrewSnapshot[];
  /** Each player's role ability (null without a role). */
  abilityOf(playerId: string): Ability | null;
  /** Level time, ticking between snapshots. */
  elapsedMs: number;
  /** The local player's preview and ability, for the pass-target ring. */
  local: { ability: Ability | null; preview: AbilityPreview } | null;
};

/** The markers to draw now, head markers in crew order, then the pass target. */
export function abilityMarkers(input: AbilityMarkerInput): AbilityMarker[] {
  const markers: AbilityMarker[] = [];
  for (const member of input.crew) {
    if (member.fieldCall) {
      const left = member.fieldCall.endsAtMs - input.elapsedMs;
      const ring = Math.min(1, Math.max(0, left / ABILITY.fieldCall.callMs));
      markers.push({ kind: 'call', playerId: member.id, ring });
      continue;
    }
    const ability = input.abilityOf(member.id);
    if (member.abilityArmed && ability) {
      markers.push({ kind: 'armed', playerId: member.id, ability });
    }
  }
  const local = input.local;
  if (
    local?.ability === 'passFolder' &&
    local.preview.kind === 'now' &&
    local.preview.targetPlayerId
  ) {
    markers.push({ kind: 'passTarget', playerId: local.preview.targetPlayerId });
  }
  return markers.slice(0, MAX_ABILITY_MARKERS);
}
