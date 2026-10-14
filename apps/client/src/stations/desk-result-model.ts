// The lines under the desk result (S7-04): what proved a good verdict, or what went wrong and
// which station decides the story. Pure, so every outcome is unit-tested. At most two lines;
// chips carry station names only, never stamp text, so a line stays within 8 words. The lines
// are the same on every difficulty: the folder is closed, so this is a debrief of a decision,
// not a minigame reveal (Decision log).
import {
  countsAsProof,
  type FolderResult,
  isHintOnly,
  type ProofStory,
  type StationKind,
  type Verdict,
} from '@redakcja/shared';
import { pl } from '../strings/pl.ts';

export type DeskResultLine =
  /** Correct verdict: the stations whose cited stamps proved it. */
  | { kind: 'proof'; stations: StationKind[] }
  /** A cited stamp is not proof of this verdict. */
  | { kind: 'weakProof' }
  /** Fewer proofs cited than the story requires. */
  | { kind: 'tooFewProofs'; have: number; need: number }
  /** Only hint-only stamps (the AI scanner) were cited: a hint, never proof. */
  | { kind: 'hintOnly'; stations: StationKind[] }
  /** The stations on this level whose stamp proves the story. */
  | { kind: 'decidedBy'; stations: StationKind[] }
  | { kind: 'correctVerdict'; verdict: Verdict }
  /** Wrong verdict although the folder carried deciding proof from these stations. */
  | { kind: 'proofInFolder'; stations: StationKind[] }
  /** Wrong verdict and no deciding proof in the folder: these stations were never asked. */
  | { kind: 'notChecked'; stations: StationKind[] };

export type DeskResultInput = Pick<
  FolderResult,
  'reason' | 'justifyingStampIds' | 'requiredStamps'
> & {
  /** Stamps the folder carried when it was closed. */
  folderStampIds: readonly string[];
  /** Station kinds on the level's map; stations elsewhere are never named. Empty: unknown. */
  levelStations: readonly StationKind[];
};

/** Story facts the lines read; the content `Story` fits it. */
export type DeskResultStory = ProofStory & { correctVerdict: Verdict };

export const DESK_RESULT_MAX_LINES = 2;
/** Chips per line; with the longest label ('Dowód był w teczce:') a line stays at 7 words. */
export const DESK_RESULT_MAX_STATIONS = 3;

export function deskResultLines(
  input: DeskResultInput,
  story: DeskResultStory | undefined,
): DeskResultLine[] {
  if (!story) {
    return [];
  }
  const cited = [...new Set(input.justifyingStampIds)];
  const stationOf = (stampId: string) => story.stamps.find((s) => s.id === stampId)?.station;
  /** Stations of the given stamps, in their order, without repeats, capped for the word limit. */
  const stationsOf = (stampIds: readonly string[]): StationKind[] => {
    const stations: StationKind[] = [];
    for (const id of stampIds) {
      const station = stationOf(id);
      if (station !== undefined && !stations.includes(station)) {
        stations.push(station);
      }
    }
    return stations.slice(0, DESK_RESULT_MAX_STATIONS);
  };
  const onLevel = (station: StationKind) =>
    input.levelStations.length === 0 || input.levelStations.includes(station);
  const proofStamps = story.stamps.filter((stamp) => countsAsProof(story, stamp.id));
  const deciding = stationsOf(
    proofStamps.filter((stamp) => onLevel(stamp.station)).map((stamp) => stamp.id),
  );
  const decidedBy: DeskResultLine[] =
    deciding.length > 0 ? [{ kind: 'decidedBy', stations: deciding }] : [];

  /** Wrong verdicts and folders closed without one: the right verdict and where the proof was. */
  const missedLines = (): DeskResultLine[] => {
    const collected = stationsOf(
      proofStamps
        .filter((stamp) => input.folderStampIds.includes(stamp.id))
        .map((stamp) => stamp.id),
    );
    const proof: DeskResultLine[] =
      collected.length > 0
        ? [{ kind: 'proofInFolder', stations: collected }]
        : deciding.length > 0
          ? [{ kind: 'notChecked', stations: deciding }]
          : [];
    return [{ kind: 'correctVerdict', verdict: story.correctVerdict }, ...proof];
  };

  const lines = ((): DeskResultLine[] => {
    switch (input.reason) {
      case 'correctNormal':
      case 'correctImportant':
      case 'correctWithContext': {
        const proof = stationsOf(cited.filter((id) => countsAsProof(story, id)));
        return proof.length > 0 ? [{ kind: 'proof', stations: proof }] : [];
      }
      case 'correctionFiled':
        // A correction needs no evidence; the title says it all.
        return [];
      case 'weakProof':
        return [{ kind: 'weakProof' }, ...decidedBy];
      case 'incompleteProof': {
        const have = cited.filter(
          (id) => countsAsProof(story, id) && input.folderStampIds.includes(id),
        ).length;
        const hints = stationsOf(
          cited.filter((id) => {
            const station = stationOf(id);
            return station !== undefined && isHintOnly(station);
          }),
        );
        const first: DeskResultLine =
          have === 0 && hints.length > 0
            ? { kind: 'hintOnly', stations: hints }
            : { kind: 'tooFewProofs', have, need: input.requiredStamps };
        return [first, ...decidedBy];
      }
      case 'publishedFake':
      case 'rejectedTrue':
      case 'contextOnTrue':
      case 'publishedWithoutContext':
      case 'rejectedContextStory':
      case 'expired':
      case 'expiredUnpenalized':
      case 'unfinished':
        return missedLines();
    }
  })();
  return lines.slice(0, DESK_RESULT_MAX_LINES);
}

/**
 * The words before a line's chips (or the whole line when it has none). Chips are station short
 * names (`pl.guidance.stationShort`); the correct verdict is a small verdict stamp.
 */
export function deskResultLabel(line: DeskResultLine): string {
  const strings = pl.desk.result;
  switch (line.kind) {
    case 'proof':
      return strings.proof;
    case 'weakProof':
      return strings.weakProof;
    case 'tooFewProofs':
      return strings.tooFewProofs(line.have, line.need);
    case 'hintOnly':
      return strings.hintOnly(line.stations.map((s) => pl.vocab.stations[s]));
    case 'decidedBy':
      return strings.decidedBy;
    case 'correctVerdict':
      return strings.correctVerdict;
    case 'proofInFolder':
      return strings.proofInFolder;
    case 'notChecked':
      return strings.notChecked;
  }
}

/** The station chips a line carries after its label; none for the text-only lines. */
export function deskResultChips(line: DeskResultLine): readonly StationKind[] {
  switch (line.kind) {
    case 'proof':
    case 'decidedBy':
    case 'proofInFolder':
    case 'notChecked':
      return line.stations;
    case 'weakProof':
    case 'tooFewProofs':
    case 'hintOnly':
    case 'correctVerdict':
      return [];
  }
}
