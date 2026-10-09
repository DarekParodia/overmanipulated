// Pure model behind the level-event presentation (S4-05..S4-09): which banner an event shows,
// the numbers on the folder badges and how tagged folders are grouped. No React, no stores, so
// everything is unit-tested directly.
import {
  EVENT_BOSS_URGENT_MS,
  EVENTS,
  type Folder,
  type FolderTag,
  type LevelEventKind,
  type Station,
} from '@redakcja/shared';
import { pl } from '../strings/pl.ts';
import { formatNumber } from '../strings/typography.ts';
import type { IconName } from '../ui/icons/Icon.tsx';

export type BannerTone = 'warn' | 'danger' | 'good';

export type EventBanner = {
  id: string;
  /** Which event it is about (selects the test id). */
  event: LevelEventKind | 'raidResolved';
  tone: BannerTone;
  icon: IconName;
  title: string;
  line: string;
};

export const EVENT_ICON: Record<LevelEventKind, IconName> = {
  viral: 'share',
  bossCall: 'phone',
  botRaid: 'bot',
  outage: 'bolt',
  correction: 'siren',
};

const EVENT_TONE: Record<LevelEventKind, BannerTone> = {
  viral: 'warn',
  bossCall: 'danger',
  botRaid: 'warn',
  outage: 'warn',
  correction: 'danger',
};

type LevelEventMessage = {
  event: LevelEventKind;
  phase: 'start' | 'end';
  stationId?: string | undefined;
};

/** Name of a station by its fixture id (for the outage banner), or a generic fallback. */
export type StationNamer = (stationId: string | undefined) => string;

/**
 * The banner for a `levelEvent`, or null when the event needs none (only outages announce
 * their end: the other events end quietly because their folders resolve themselves).
 */
export function bannerForLevelEvent(
  message: LevelEventMessage,
  serial: number,
  stationName: StationNamer,
): EventBanner | null {
  const { event, phase } = message;
  const id = `${event}-${phase}-${serial}`;
  const { banner, done } = pl.events;
  if (phase === 'start') {
    const icon = EVENT_ICON[event];
    const tone = EVENT_TONE[event];
    switch (event) {
      case 'viral':
        return { id, event, tone, icon, ...banner.viral };
      case 'bossCall':
        return { id, event, tone, icon, ...banner.bossCall };
      case 'botRaid':
        return { id, event, tone, icon, ...banner.botRaid };
      case 'correction':
        return { id, event, tone, icon, ...banner.correction };
      case 'outage':
        return {
          id,
          event,
          tone,
          icon,
          title: banner.outage.title,
          line: banner.outage.line(stationName(message.stationId)),
        };
    }
  }
  if (event === 'outage') {
    return {
      id,
      event,
      tone: 'good',
      icon: 'check',
      title: done.outage.title,
      line: done.outage.line(stationName(message.stationId)),
    };
  }
  return null;
}

export function raidResolvedBanner(serial: number): EventBanner {
  return {
    id: `raid-resolved-${serial}`,
    event: 'raidResolved',
    tone: 'good',
    icon: 'check',
    ...pl.events.done.raid,
  };
}

/** Banner stack: newest first, at most `max`. */
export function pushBanner(
  current: readonly EventBanner[],
  banner: EventBanner,
  max: number,
): EventBanner[] {
  return [banner, ...current.filter((b) => b.id !== banner.id)].slice(0, max);
}

// --- Folder badges ---------------------------------------------------------------------------

/** Shares shown on a viral folder: `start * growth ^ ageS`, rounded (decision log S4). */
export function viralShares(folder: Pick<Folder, 'spawnedAtMs'>, elapsedMs: number): number {
  const ageS = Math.max(0, (elapsedMs - folder.spawnedAtMs) / 1000);
  return Math.round(EVENTS.viralSharesStart * EVENTS.viralGrowthPerS ** ageS);
}

/** Wide numbers shrink to thousands so the badge stays small. */
export function formatShares(shares: number): string {
  if (shares < 10_000) {
    return formatNumber(shares);
  }
  return `${formatNumber(Math.round(shares / 1000))} tys.`;
}

export function bossCallLeftMs(
  tag: Extract<FolderTag, { kind: 'bossCall' }>,
  elapsedMs: number,
): number {
  return Math.max(0, tag.untilMs - elapsedMs);
}

export function bossCallUrgent(leftMs: number): boolean {
  return leftMs > 0 && leftMs <= EVENT_BOSS_URGENT_MS;
}

/** Whole seconds left on a boss call (rounded up so it never shows 0 while it still stands). */
export function bossCallSeconds(leftMs: number): number {
  return Math.ceil(leftMs / 1000);
}

/** Folders per raid id, for the "×N" badge. */
export function raidSizes(folders: readonly Folder[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const folder of folders) {
    if (folder.tag?.kind === 'botRaid') {
      sizes.set(folder.tag.raidId, (sizes.get(folder.tag.raidId) ?? 0) + 1);
    }
  }
  return sizes;
}

/** What a folder's tag shows right now: an icon and a short label for the badge. */
export type TagBadge = {
  kind: FolderTag['kind'];
  icon: IconName;
  /** Number or time on the badge; empty when the icon says it all. */
  text: string;
  /** Accessible name. */
  label: string;
  tone: BannerTone;
  /** Urgent badges shake (not with reduced motion). */
  urgent: boolean;
};

export function tagBadge(
  folder: Folder,
  elapsedMs: number,
  raidSize: (raidId: string) => number,
): TagBadge | null {
  const tag = folder.tag;
  if (!tag) {
    return null;
  }
  switch (tag.kind) {
    case 'viral': {
      const shares = viralShares(folder, elapsedMs);
      return {
        kind: 'viral',
        icon: 'share',
        text: formatShares(shares),
        label: pl.events.badge.shares(formatNumber(shares)),
        tone: 'warn',
        urgent: false,
      };
    }
    case 'bossCall': {
      const left = bossCallLeftMs(tag, elapsedMs);
      const seconds = bossCallSeconds(left);
      return {
        kind: 'bossCall',
        icon: 'phone',
        text: left > 0 ? `${seconds} s` : '',
        label: left > 0 ? pl.events.badge.bossCall(seconds) : pl.events.badge.bossCallOver,
        tone: left > 0 ? 'danger' : 'warn',
        urgent: bossCallUrgent(left),
      };
    }
    case 'botRaid': {
      const size = raidSize(tag.raidId);
      return {
        kind: 'botRaid',
        icon: 'bot',
        text: size > 1 ? `×${size}` : '',
        label: pl.events.badge.raid(size),
        tone: 'warn',
        urgent: false,
      };
    }
    case 'correction':
      return {
        kind: 'correction',
        icon: 'siren',
        text: '',
        label: pl.events.badge.correction,
        tone: 'danger',
        urgent: false,
      };
  }
}

// --- Outages ---------------------------------------------------------------------------------

export function stationIsDown(station: Pick<Station, 'outageMs'> | undefined): boolean {
  return station !== undefined && station.outageMs > 0;
}

/** Fraction of the outage still to run, 0..1, against the announced (or default) duration. */
export function outageFraction(outageMs: number, totalMs: number | undefined): number {
  const total = Math.max(totalMs ?? EVENTS.outageDefaultMs, outageMs, 1);
  return Math.min(1, Math.max(0, outageMs / total));
}

/** Whole seconds left on an outage. */
export function outageSeconds(outageMs: number): number {
  return Math.max(0, Math.ceil(outageMs / 1000));
}

// --- Correction desk sheet -------------------------------------------------------------------

/**
 * The stamp id a correction verdict carries: the story's first justifying stamp, or its first
 * stamp (the sim accepts any justifying stamp id for a correction).
 */
export function correctionStampId(
  story: { justifyingStamps: readonly string[]; stamps: readonly { id: string }[] } | undefined,
  folder: Pick<Folder, 'stamps'>,
): string | null {
  return story?.justifyingStamps[0] ?? story?.stamps[0]?.id ?? folder.stamps[0] ?? null;
}
