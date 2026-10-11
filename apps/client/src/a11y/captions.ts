// Caption table (S5-05): the visual twin of every cue that makes a sound. Keyed by CueId so the
// catalogue in fx/cues.ts stays untouched; the type below is exhaustive, so adding a cue without
// deciding on its caption does not compile, and captions.test.ts checks the decisions.
//
// A caption is a short icon + words chip (≤ 3 words). A cue that needs none says why.
import type { CueId } from '../fx/cues.ts';
import { pl } from '../strings/pl.ts';
import type { IconName } from '../ui/icons/Icon.tsx';

export type CaptionTone = 'info' | 'warn' | 'danger' | 'good';

/** Which player's doing it was, relative to the local player. */
export type CaptionScope = 'any' | 'remote' | 'local';

export type CaptionChip = {
  icon: IconName;
  text: string;
  tone: CaptionTone;
};

export type CaptionRule = CaptionChip & {
  /** Chips of one group replace each other (the deadline ticks keep one chip alive). */
  group?: string;
  /** How long the chip stays; defaults to `DEFAULT_CAPTION_MS`. */
  ttlMs?: number;
  /** Show only for cues about another player / the local player; default `any`. */
  scope?: CaptionScope;
  /** Replacement chip when the cue is about another player. */
  remote?: CaptionChip;
};

/** Why a sound needs no caption. */
export type SkipReason =
  /** A press on the player's own UI: the control itself reacts. */
  | 'ui'
  /** The player's own input; the thing they did is on screen and under their finger. */
  | 'own-action'
  /** Another element already says it in words (verdict toast, results plate, screen change). */
  | 'visual-elsewhere'
  /** Atmosphere that carries no information. */
  | 'decorative';

export type CaptionEntry = { caption: CaptionRule } | { skip: SkipReason };

export const DEFAULT_CAPTION_MS = 2400;

const t = pl.a11y.captions;

const chip = (
  icon: IconName,
  text: string,
  tone: CaptionTone,
  extra: Omit<CaptionRule, 'icon' | 'text' | 'tone'> = {},
): CaptionEntry => ({ caption: { icon, text, tone, ...extra } });

const skip = (reason: SkipReason): CaptionEntry => ({ skip: reason });

export const captionTable: Record<CueId, CaptionEntry> = {
  'ui.click': skip('ui'),
  'ui.hover': skip('ui'),
  'ui.back': skip('ui'),
  'ui.copy': skip('ui'),
  // The „Nowa karta!” chip in the Kolegium says it in words.
  'encyclopedia.unlock': skip('visual-elsewhere'),
  'player.join': chip('user', t.playerJoined, 'info'),
  'player.reconnect': chip('user', t.playerBack, 'info'),
  'player.leave': chip('user', t.playerLeft, 'warn'),
  'player.step': skip('decorative'),
  'player.stepRemote': skip('decorative'),
  'player.start': skip('decorative'),
  'player.stop': skip('decorative'),
  'game.start': skip('visual-elsewhere'),
  'stamp.applied': skip('visual-elsewhere'),
  'folder.arrive': chip('folder', t.newFolder, 'info', { group: 'arrive', ttlMs: 1800 }),
  'folder.pickup': skip('own-action'),
  'folder.drop': skip('own-action'),
  'folder.deadlineWarning': chip('hourglass', t.deadlineNear, 'warn', {
    group: 'deadline',
    ttlMs: 1600,
  }),
  // The ticks keep the same chip alive for as long as they run.
  'folder.deadlineTick': chip('hourglass', t.deadlineNear, 'warn', {
    group: 'deadline',
    ttlMs: 1600,
  }),
  'folder.deadlineExtended': chip('hourglass', t.moreTime, 'good'),
  'folder.expired': chip('expired', t.folderLost, 'danger'),
  'station.workStart': skip('own-action'),
  'station.workCancel': skip('own-action'),
  'minigame.start': skip('own-action'),
  'minigame.fail': chip('blunder', t.mistake, 'warn', {
    group: 'mistake',
    remote: { icon: 'blunder', text: t.teammateMistake, tone: 'warn' },
  }),
  'desk.open': chip('desk', t.deskTaken, 'info', { scope: 'remote' }),
  'desk.close': skip('own-action'),
  'verdict.correct': skip('visual-elsewhere'),
  'verdict.contextCorrect': skip('visual-elsewhere'),
  'verdict.wrongJustification': skip('visual-elsewhere'),
  'verdict.wrong': skip('visual-elsewhere'),
  'verdict.fakePublished': skip('visual-elsewhere'),
  'verdict.truthRejected': skip('visual-elsewhere'),
  'ping.needArchive': chip('archive', t.pingArchive, 'info'),
  'ping.fake': chip('flag', t.pingFake, 'warn'),
  'ping.mine': chip('hand', t.pingMine, 'info'),
  'level.lastSeconds': chip('clock', t.lastSeconds, 'danger'),
  'level.win': skip('visual-elsewhere'),
  'level.lose': skip('visual-elsewhere'),
  'station.open': skip('own-action'),
  'minigame.success': skip('own-action'),
  'desk.justify': skip('own-action'),
  'ping.open': skip('own-action'),
  'ping.send': skip('own-action'),
  'sourceRegistry.circle': skip('own-action'),
  'sourceRegistry.uncircle': skip('own-action'),
  'sourceRegistry.mistake': skip('own-action'),
  'sourceRegistry.file': skip('own-action'),
  'archive.tick': skip('own-action'),
  'archive.stop': skip('own-action'),
  'archive.miss': skip('own-action'),
  'archive.found': skip('own-action'),
  'imageSearch.fragment': skip('own-action'),
  'imageSearch.match': skip('own-action'),
  'imageSearch.miss': skip('own-action'),
  'lobby.ready': skip('visual-elsewhere'),
  'briefing.intro': skip('visual-elsewhere'),
  'briefing.land': skip('visual-elsewhere'),
  'briefing.ready': skip('visual-elsewhere'),
  'debrief.star': skip('visual-elsewhere'),
  'debrief.mark': skip('visual-elsewhere'),
  'debrief.vote': skip('visual-elsewhere'),
  // The distant ringing is room tone; the boss call (event.bossCall.start) is the real phone.
  'ambience.phone': skip('decorative'),
  'ambience.printer': skip('decorative'),
  'ambience.fax': skip('decorative'),
  'ambience.typing': skip('decorative'),
  'phone.ring': skip('own-action'),
  'phone.hold': skip('own-action'),
  'phone.connect': skip('own-action'),
  'phone.wrong': skip('own-action'),
  'aiScanner.scan': skip('own-action'),
  'aiScanner.answer': skip('own-action'),
  'aiScanner.wrong': skip('own-action'),
  'dataLibrary.right': skip('own-action'),
  'dataLibrary.mistake': skip('own-action'),
  'endless.tempo': chip('clock', t.tempoUp, 'warn'),
  'endless.over': skip('visual-elsewhere'),
  'endless.record': chip('trophy', t.record, 'good'),
  'event.viral.start': chip('share', t.viral, 'warn'),
  'event.bossCall.start': chip('phone', t.phoneRings, 'danger'),
  'event.botRaid.start': chip('bot', t.botRaid, 'warn'),
  'event.outage.start': chip('bolt', t.outage, 'danger'),
  'event.correction.start': chip('siren', t.correction, 'danger'),
  'event.outage.end': chip('bolt', t.powerBack, 'good'),
  'event.end': skip('decorative'),
  'event.raidResolved': chip('check', t.raidResolved, 'good'),
  'event.outage.spark': skip('decorative'),
};

/** The chip a cue shows for the given context, or null when it shows none. */
export function captionFor(cue: CueId, remote: boolean): (CaptionChip & CaptionRule) | null {
  const entry = captionTable[cue];
  if (!('caption' in entry)) {
    return null;
  }
  const rule = entry.caption;
  const scope = rule.scope ?? 'any';
  if ((scope === 'remote' && !remote) || (scope === 'local' && remote)) {
    return null;
  }
  return remote && rule.remote ? { ...rule, ...rule.remote } : rule;
}
