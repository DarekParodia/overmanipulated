// The rival chip (S7-89, design-rules §1.3/§5): in versus, the other newsroom's badge, name and
// points, with an arrow up while this newsroom leads and down while it trails (none when tied).
// Desktop: it hangs under the HUD pill (in endless versus in place of the tempo chip); phones:
// the last segment of the one-row pill, badge and points only. A change of lead plays
// `versus.leadTaken` / `versus.leadLost` (at most once per `VERSUS.leadCueCooldownMs`): the chip
// pops or shakes, never under reduced motion. Hidden in co-op (no scoreboard).
import { useEffect, useRef } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { useGame } from '../net/game-store.ts';
import { selfTeam, useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { TeamBadge, teamName } from '../ui/TeamBadge.tsx';
import styles from './Hud.module.css';
import { formatScore } from './hud-model.ts';
import { playMotion, useHudTrigger } from './hud-motion.ts';
import { useRolledNumber } from './use-rolled-number.ts';
import { type LeadState, leadCue, standingsOf } from './versus-model.ts';

/** Arrow turn per lead: the `arrow` icon points right, so up and down are quarter turns. */
const ARROW_TURN = { ahead: 'rotate(-90deg)', behind: 'rotate(90deg)' } as const;

export function VersusChip() {
  const scoreboard = useGame((s) => s.scoreboard);
  const ended = useGame((s) => s.levelEnd !== null);
  const ownTeam = useApp((s) => selfTeam(s.room, s.playerId));
  const standings = standingsOf(scoreboard, ownTeam);
  const lead = standings?.lead ?? null;
  const shown = useRolledNumber(standings?.rival.score ?? 0);
  const chip = useRef<HTMLDivElement>(null);
  const previous = useRef<LeadState | null>(null);
  const lastCueAt = useRef<number | null>(null);
  const leadNow = useRef(lead);
  leadNow.current = lead;

  useEffect(() => {
    if (lead === null) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = lead;
    // The first standings of a match (or after a reload) set the baseline: no cue.
    if (before === null || ended) {
      return;
    }
    const now = performance.now();
    const cue = leadCue(before, lead, lastCueAt.current, now);
    if (cue) {
      lastCueAt.current = now;
      emitCue(cue);
    }
  }, [lead, ended]);

  useHudTrigger(['versusLead'], (_trigger, _context, options) => {
    playMotion(chip.current, leadNow.current === 'behind' ? 'shake' : 'bump', options);
  });

  if (!standings || lead === null) {
    return null;
  }
  const { rival } = standings;
  const name = teamName(rival.team);
  const arrow = lead === 'tied' ? null : ARROW_TURN[lead];
  return (
    <div
      ref={chip}
      className={styles.versus}
      data-testid="versus-chip"
      data-hud-band
      data-lead={lead}
      role="img"
      aria-label={`${pl.versus.chipLabel(name, rival.score)}. ${pl.versus.lead[lead]}`}
    >
      <TeamBadge team={rival.team} size={26} />
      <span className={styles.versusName} aria-hidden>
        {name}
      </span>
      <span className={styles.versusScore} aria-hidden data-testid="versus-chip-score">
        {formatScore(shown)}
      </span>
      {arrow && (
        <span className={styles.versusArrow} aria-hidden>
          <Icon name="arrow" size={20} style={{ transform: arrow }} />
        </span>
      )}
    </div>
  );
}
