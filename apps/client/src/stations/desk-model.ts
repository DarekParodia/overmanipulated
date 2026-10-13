// Pure model of the desk's evidence pick (S7-19): which collected stamps the player cites with
// a verdict. A one-proof story behaves as before (picking a stamp replaces the pick); a
// multi-stamp story (`requiredStamps` ≥ 2) toggles stamps, up to N, in the order picked. The
// verdict buttons open once the pick holds `min(N, collected)` stamps, so a folder that came
// back with fewer stamps than N can still be decided (citing what it has, for half points).

export type EvidenceToggle = {
  /** The new pick, in the order the stamps were chosen. */
  selected: string[];
  /** Adding the stamp would cite more than N: the pick is unchanged. */
  blocked: boolean;
  /** The stamp was taken out of the pick. */
  removed: boolean;
};

/** Picks or unpicks `id`: N = 1 replaces, N ≥ 2 toggles, adding beyond N is blocked. */
export function toggleEvidence(
  selected: readonly string[],
  id: string,
  required: number,
): EvidenceToggle {
  if (required <= 1) {
    return { selected: [id], blocked: false, removed: false };
  }
  if (selected.includes(id)) {
    return { selected: selected.filter((s) => s !== id), blocked: false, removed: true };
  }
  if (selected.length >= required) {
    return { selected: [...selected], blocked: true, removed: false };
  }
  return { selected: [...selected, id], blocked: false, removed: false };
}

/** The verdict may be sent: at least one stamp cited, and as many as N or all collected. */
export function verdictReady(
  selected: readonly string[],
  required: number,
  collected: number,
): boolean {
  return selected.length >= 1 && selected.length === Math.min(required, collected);
}

/** The folder came back with fewer stamps than the story needs proofs (amber warning). */
export function evidenceShortfall(required: number, collected: number): boolean {
  return collected < required;
}
