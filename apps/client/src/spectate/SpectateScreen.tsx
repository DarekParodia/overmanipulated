// The spectate screen (S7-90), in the lazy game chunk: what a member of the Widownia watches
// while a match is played and once it ended. One GameView canvas per newsroom on screen
// (spectate-layout.ts: side by side, one over the other or one at a time; phones always one,
// with a one-tap team switch), a full-width top-bar scoreboard with both scores always visible,
// and a plate per view with the team's badge and players. Spectator canvases run on the medium
// preset at most, without shadows (scene/quality.ts `spectatorProfile`); sounds follow the
// spectator audio policy (spectate-audio.ts). S7-91: follow a player (←/→ or A/D, the d-pad or
// RB, a tap on their chip; Esc / B stops), whom the view's camera glides after with a blue ring on
// their chip and name tag and a FollowCard in their newsroom's view; the event feed (the visual
// twin of every sound, embargoed in versus); the stats sheet (Q, Y or „Statystyki”); and, once
// every watched newsroom's level end is in, the spectator results in place of the views.
import {
  ENDLESS_LEVEL_ID,
  type LevelEndMessage,
  type LobbyPlayer,
  type TeamIndex,
} from '@redakcja/shared';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { PHONE_QUERY, useMediaQuery } from '../debrief/use-media-query.ts';
import { formatElapsed } from '../endless/endless-model.ts';
import { useEventFeed } from '../events/EventBanners.tsx';
import { playSound, startAmbience, stopAmbience } from '../fx/audio/audio-manager.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { formatClock } from '../hud/hud-model.ts';
import { useLevelClock } from '../hud/use-level-clock.ts';
import { type NavIntent, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { useWakeLock } from '../mobile/device.ts';
import { backToLobby, leaveRoom } from '../net/session.ts';
import { type SpectateView, teamView, useSpectate } from '../net/spectate-store.ts';
import { GameViewProvider } from '../net/view-context.tsx';
import { GameCanvas } from '../scene/GameCanvas.tsx';
import { isCoarsePointer } from '../scene/quality.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { TeamBadge } from '../ui/TeamBadge.tsx';
import { EventFeed } from './EventFeed.tsx';
import { FollowCard } from './FollowCard.tsx';
import { FEED_VISIBLE_DESKTOP, FEED_VISIBLE_PHONE } from './feed-model.ts';
import { focusForTeam, followOrder, stepFollow } from './follow-model.ts';
import styles from './SpectateScreen.module.css';
import { SpectatorResults } from './SpectatorResults.tsx';
import { StatsSheet } from './StatsSheet.tsx';
import { type ScoreSide, scoreSides } from './scoreboard-model.ts';
import { spectatorSoundOutput, teamPan } from './spectate-audio.ts';
import {
  backFocus,
  chooseSpectateLayout,
  isPhoneViewport,
  nextFocus,
  SPECTATE_COMPACT_VIEW_WIDTH,
  type SpectateFocus,
  type SpectateLayout,
  tapTeam,
  teamKeyFocus,
  type Viewport,
  visibleTeams,
} from './spectate-layout.ts';

const CONFIRM_KEYS: ReadonlySet<string> = new Set(['Space', 'Enter', 'NumpadEnter']);
/** Keyboard follow: ← / A the previous player, → / D the next. */
const FOLLOW_KEYS: Readonly<Record<string, 1 | -1>> = {
  ArrowLeft: -1,
  KeyA: -1,
  ArrowRight: 1,
  KeyD: 1,
};
const STATS_KEY = 'KeyQ';
const NO_PLAYERS: readonly LobbyPlayer[] = [];
const COOP_TEAMS: readonly TeamIndex[] = [0];
const VERSUS_TEAMS: readonly TeamIndex[] = [0, 1];

function useViewport(): Viewport {
  const [size, setSize] = useState<Viewport>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function teamName(team: TeamIndex, versus: boolean): string {
  return versus ? (pl.vocab.teams[team] ?? pl.spectate.coopTeam) : pl.spectate.coopTeam;
}

/** The live points and credibility of every watched newsroom, from its own view store. */
function useLiveScores(teams: readonly TeamIndex[]): ScoreSide[] {
  const kurier = teamView(0);
  const glos = teamView(1);
  const scores = [
    {
      score: useStore(kurier.store, (s) => s.score),
      credibility: useStore(kurier.store, (s) => s.credibility),
    },
    {
      score: useStore(glos.store, (s) => s.score),
      credibility: useStore(glos.store, (s) => s.credibility),
    },
  ];
  // The versus scoreboard rides on every snapshot; the 1 Hz match stats cover co-op.
  const scoreboard = useStore(kurier.store, (s) => s.scoreboard);
  const stats = useSpectate((s) => s.matchStats?.teams ?? null);
  return scoreSides(
    teams,
    (team) => scores[team] ?? { score: 0, credibility: 0 },
    scoreboard ?? stats,
  );
}

function MatchClock() {
  const { timeLeftMs, elapsedMs } = useLevelClock(teamView(0).store);
  const room = useApp((s) => s.room);
  const ended = room?.phase === 'results';
  // Endless co-op counts up; a versus match always counts down (endless versus too, S7-80).
  const countUp = room?.levelId === ENDLESS_LEVEL_ID && room.mode !== 'versus';
  const clock = countUp ? formatElapsed(elapsedMs) : formatClock(timeLeftMs);
  if (ended) {
    return (
      <span className={styles.clock} role="status" data-testid="spectate-over">
        <Icon name="flag" size={24} />
        {pl.spectate.matchOver}
      </span>
    );
  }
  return (
    <span className={styles.clock} role="timer" aria-label={pl.spectate.clockLabel(clock)}>
      <Icon name="clock" size={24} />
      <span aria-hidden="true">{clock}</span>
    </span>
  );
}

type ScoreProps = {
  side: ScoreSide;
  versus: boolean;
  /** Mirrored for Głos on the right: badge outermost. */
  mirrored: boolean;
  /** The one-view layout: this score is also the button that shows its newsroom. */
  pick: { shown: boolean; onPick: () => void } | null;
};

function TeamScore({ side, versus, mirrored, pick }: ScoreProps) {
  const name = teamName(side.team, versus);
  const label = pl.spectate.teamLine(name, side.score, side.credibility);
  const content = (
    <>
      <TeamBadge team={side.team} size={30} />
      <span className={styles.teamName} aria-hidden="true">
        {name}
      </span>
      {side.leader && (
        <span className={styles.crown} title={pl.spectate.leader}>
          <Icon name="crown" size={22} label={pl.spectate.leader} />
        </span>
      )}
      <span className={styles.points} aria-hidden="true">
        <Icon name="star" size={20} />
        {side.score}
      </span>
      <span className={styles.credibility} aria-hidden="true">
        <Icon name="heart" size={20} />
        {side.credibility}
      </span>
    </>
  );
  const className = `${styles.score} ${mirrored ? styles.mirrored : ''}`;
  if (pick) {
    return (
      <button
        type="button"
        className={`${className} ${styles.pick}`}
        aria-pressed={pick.shown}
        aria-label={`${label}. ${pl.spectate.showTeam(name)}`}
        data-testid={`spectate-score-${side.team}`}
        onClick={pick.onPick}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={className} data-testid={`spectate-score-${side.team}`}>
      <span className="visually-hidden">{label}</span>
      {content}
    </div>
  );
}

/** Co-op: the folders closed with a verdict and the ones that ran out of time. */
function CoopCounts({ side }: { side: ScoreSide }) {
  return (
    <span className={styles.counts}>
      <span className={styles.count}>
        <span className="visually-hidden">{pl.spectate.resolved(side.resolved)}</span>
        <Icon name="check" size={20} />
        <span aria-hidden="true">{side.resolved}</span>
      </span>
      <span className={styles.count}>
        <span className="visually-hidden">{pl.spectate.expired(side.expired)}</span>
        <Icon name="expired" size={20} />
        <span aria-hidden="true">{side.expired}</span>
      </span>
    </span>
  );
}

function Scoreboard({
  teams,
  versus,
  single,
  shown,
  onPick,
}: {
  teams: readonly TeamIndex[];
  versus: boolean;
  single: boolean;
  shown: readonly TeamIndex[];
  onPick: (team: TeamIndex) => void;
}) {
  const sides = useLiveScores(teams);
  const [left, right] = sides;
  const pickFor = (side: ScoreSide) =>
    versus && single ? { shown: shown.includes(side.team), onPick: () => onPick(side.team) } : null;
  return (
    <section className={styles.topBar} aria-label={pl.spectate.scoreboardLabel}>
      {left && <TeamScore side={left} versus={versus} mirrored={false} pick={pickFor(left)} />}
      <MatchClock />
      {right ? (
        <TeamScore side={right} versus={versus} mirrored pick={pickFor(right)} />
      ) : (
        left && <CoopCounts side={left} />
      )}
    </section>
  );
}

/**
 * A view's header: the team badge and name (in a split, the button that focuses the team) and
 * its players, each a chip that follows them; the followed one wears a blue ring (S7-91).
 */
function TeamPlate({
  team,
  versus,
  action,
  followed,
  onFollow,
}: {
  team: TeamIndex;
  versus: boolean;
  action: { label: string; onPress: () => void } | null;
  followed: string | null;
  onFollow: (playerId: string) => void;
}) {
  const roster = useApp((s) => s.room?.players);
  const players = (roster ?? []).filter((player) => player.team === team);
  const name = teamName(team, versus);
  const head = (
    <>
      {versus ? <TeamBadge team={team} size={26} /> : <Icon name="eye" size={24} />}
      <span className={styles.plateName}>{name}</span>
    </>
  );
  return (
    <div className={styles.plate} data-testid={`spectate-plate-${team}`}>
      {action ? (
        <button
          type="button"
          className={`${styles.plateHead} ${styles.plateButton}`}
          aria-label={action.label}
          data-testid={`spectate-team-${team}`}
          onClick={action.onPress}
        >
          {head}
        </button>
      ) : (
        <span className={styles.plateHead}>{head}</span>
      )}
      <span className={styles.chips}>
        {players.map((player) => (
          <button
            type="button"
            key={player.id}
            className={`${styles.chip} ${player.connected ? '' : styles.away}`}
            aria-pressed={followed === player.id}
            aria-label={pl.spectate.follow.chip(player.nickname)}
            data-testid={`spectate-player-${player.id}`}
            onClick={() => onFollow(player.id)}
          >
            <PlayerMark colorIndex={player.colorIndex} size={16} />
            <span className={styles.chipName}>{player.nickname}</span>
          </button>
        ))}
      </span>
    </div>
  );
}

/** One newsroom on screen: its canvas, its plate and, before the first snapshot, a wait line. */
function ViewPane({
  view,
  slot,
  primary,
  compact,
  versus,
  plateAction,
  followed,
  onFollow,
}: {
  view: SpectateView;
  slot: number;
  primary: boolean;
  compact: boolean;
  versus: boolean;
  plateAction: { label: string; onPress: () => void } | null;
  /** The followed player, when they play in this newsroom. */
  followed: LobbyPlayer | null;
  onFollow: (playerId: string | null) => void;
}) {
  const live = useStore(view.store, (s) => s.tick > 0);
  return (
    <section
      className={styles.pane}
      aria-label={teamName(view.team, versus)}
      data-testid="spectate-view"
      data-team={view.team}
      data-live={live}
      data-compact={compact || undefined}
    >
      <GameViewProvider view={view.view}>
        <EventFeedHook />
        <GameCanvas view={view.view} primary={primary} viewKey={`spectate-${slot}`} />
      </GameViewProvider>
      <TeamPlate
        team={view.team}
        versus={versus}
        action={plateAction}
        followed={followed?.id ?? null}
        onFollow={onFollow}
      />
      {followed && live && (
        <FollowCard view={view} player={followed} onStop={() => onFollow(null)} />
      )}
      {!live && (
        <p className={styles.waiting} role="status">
          {pl.spectate.waiting}
        </p>
      )}
    </section>
  );
}

/** Feeds the view's level events and station lockouts into its event store (world markers). */
function EventFeedHook() {
  useEventFeed();
  return null;
}

/**
 * The keys: follow and the stats sheet, plus the view toggle of a versus split (or of the one-view
 * layout, where it swaps the newsroom). Co-op's one newsroom has no view to toggle.
 */
function KeyHint({ hint }: { hint: 'split' | 'single' | 'coop' }) {
  const device = useApp((s) => s.inputDevice);
  if (device !== 'keyboard' && device !== 'gamepad') {
    return null;
  }
  return (
    <p className={styles.hint} data-testid="spectate-hint">
      <Icon name={device === 'gamepad' ? 'gamepad' : 'eye'} size={20} />
      {typeset(pl.spectate.hints[device][hint])}
    </p>
  );
}

/** Each watched newsroom's level end once all of them are in (the spectator results), else null. */
function useMatchEnds(teams: readonly TeamIndex[]): LevelEndMessage[] | null {
  const levelEnds = useSpectate((s) => s.levelEnds);
  return useMemo(() => {
    const ends = teams.map((team) => levelEnds[team] ?? null);
    const arrived = ends.flatMap((end) => (end ? [end] : []));
    return arrived.length === ends.length ? arrived : null;
  }, [teams, levelEnds]);
}

export function SpectateScreen() {
  const versus = useApp((s) => s.room?.mode === 'versus');
  const phase = useApp((s) => s.room?.phase);
  const host = useApp((s) => s.room !== null && s.room.hostId === s.playerId);
  const connection = useApp((s) => s.connection);
  const roster = useApp((s) => s.room?.players ?? NO_PLAYERS);
  const teams = versus ? VERSUS_TEAMS : COOP_TEAMS;
  const size = useViewport();
  const phoneSize = useMediaQuery(PHONE_QUERY);
  const phone = isPhoneViewport(size, isCoarsePointer());
  const layout: SpectateLayout = chooseSpectateLayout(size, teams.length, phone);
  const [focus, setFocus] = useState<SpectateFocus>('split');
  const [statsOpen, setStatsOpen] = useState(false);
  const followedId = useSpectate((s) => s.followed);
  const ends = useMatchEnds(teams);
  const ended = ends !== null;
  const shown = visibleTeams(layout, teams, focus);
  const single = shown.length < 2;
  const shownKey = shown.join(',');
  const paneWidth = layout === 'side' && !single ? size.width / 2 : size.width;
  const compact = paneWidth < SPECTATE_COMPACT_VIEW_WIDTH;
  const followed = roster.find((player) => player.id === followedId) ?? null;
  const order = useMemo(() => followOrder(roster, teams), [roster, teams]);

  useWakeLock(true);
  useEffect(() => requestMusic('game'), []);
  useEffect(() => {
    startAmbience();
    return stopAmbience;
  }, []);

  // Only the newsrooms on screen are heard: quieter, and to their side while both are shown.
  useEffect(() => {
    if (ended) {
      return;
    }
    const onScreen = shownKey.split(',').map(Number);
    const split = onScreen.length > 1;
    const disconnects = onScreen.map((team) =>
      teamView(team).view.feedback.connect({
        playSound: spectatorSoundOutput(playSound, teamPan(team, split)),
      }),
    );
    return () => {
      for (const disconnect of disconnects) {
        disconnect();
      }
    };
  }, [shownKey, ended]);

  // The match is over: nobody to follow, no live stats.
  useEffect(() => {
    if (ended) {
      setStatsOpen(false);
      useSpectate.getState().follow(null);
    }
  }, [ended]);

  const actions = useMemo(() => {
    /** Follows a player, or stops with null. */
    const follow = (next: string | null) => {
      if (next === useSpectate.getState().followed) {
        return;
      }
      useSpectate.getState().follow(next);
      emitCue('spectate.follow');
      const team = order.find((player) => player.id === next)?.team;
      if (team !== undefined) {
        setFocus((now) => focusForTeam(layout, teams, now, team));
      }
    };
    return {
      intent(intent: NavIntent): boolean {
        if (intent === 'confirm') {
          setFocus((current) => nextFocus(layout, teams, current));
          return teams.length > 1;
        }
        if (intent === 'back') {
          if (useSpectate.getState().followed !== null) {
            follow(null);
            return true;
          }
          const back = backFocus(layout, focus);
          if (back !== null) {
            setFocus(back);
            return true;
          }
        }
        return false;
      },
      tap(team: TeamIndex) {
        setFocus((current) => tapTeam(layout, teams, current, team));
      },
      follow,
      /** A chip: follows its player; a second tap on the followed one stops. */
      tapPlayer(playerId: string | null) {
        follow(playerId === useSpectate.getState().followed ? null : playerId);
      },
      step(direction: 1 | -1) {
        follow(stepFollow(order, useSpectate.getState().followed, direction));
      },
      toggleStats() {
        emitCue('ui.click');
        setStatsOpen((open) => !open);
      },
    };
  }, [layout, teams, focus, order]);

  // Gamepad: ←/→ (d-pad, stick) and RB follow, A toggles the view, B stops following and then
  // brings both newsrooms back, Y opens the stats; ↑/↓ move between the buttons through the menu
  // navigation, which then presses the one in focus. An open stats sheet takes the pad itself.
  useInputCapture(true);
  useNavIntent((intent) => {
    if (ended || document.querySelector('dialog[open]')) {
      return false;
    }
    if (intent === 'left' || intent === 'right') {
      actions.step(intent === 'right' ? 1 : -1);
      return true;
    }
    if (intent === 'ability') {
      actions.step(1);
      return true;
    }
    if (intent === 'alt') {
      actions.toggleStats();
      return true;
    }
    if (intent === 'confirm' && document.activeElement instanceof HTMLButtonElement) {
      return false;
    }
    return actions.intent(intent);
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || ended) {
        return;
      }
      // The stats sheet is a modal dialog: Esc and Tab are the browser's there.
      if (document.querySelector('dialog[open]')) {
        return;
      }
      const step = FOLLOW_KEYS[event.code];
      if (step !== undefined) {
        event.preventDefault();
        useApp.getState().setInputDevice('keyboard');
        actions.step(step);
        return;
      }
      if (event.repeat) {
        return;
      }
      if (event.code === STATS_KEY) {
        event.preventDefault();
        useApp.getState().setInputDevice('keyboard');
        actions.toggleStats();
        return;
      }
      const team = teamKeyFocus(teams, event.code);
      if (team !== null) {
        event.preventDefault();
        useApp.getState().setInputDevice('keyboard');
        setFocus(team);
        return;
      }
      // A focused button keeps the browser's own Space / Enter.
      if (event.target instanceof HTMLButtonElement && CONFIRM_KEYS.has(event.code)) {
        return;
      }
      const intent = CONFIRM_KEYS.has(event.code)
        ? 'confirm'
        : event.code === 'Escape'
          ? 'back'
          : null;
      if (intent && actions.intent(intent)) {
        event.preventDefault();
        useApp.getState().setInputDevice('keyboard');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions, teams, ended]);

  const plateAction = (team: TeamIndex) => {
    if (!versus || layout === 'single') {
      return null;
    }
    const name = teamName(team, versus);
    return {
      label: single ? pl.spectate.bothTeams : pl.spectate.focusTeam(name),
      onPress: () => actions.tap(team),
    };
  };
  const hint = teams.length < 2 ? 'coop' : layout === 'single' ? 'single' : 'split';
  // On a phone the FollowCard takes the feed's place.
  const feedShown = !ended && !(phoneSize && followed !== null);

  return (
    <main className={styles.screen} data-testid="spectate-screen" data-layout={layout}>
      <Scoreboard
        teams={teams}
        versus={versus}
        single={layout === 'single' && !ended}
        shown={shown}
        onPick={actions.tap}
      />
      {ends ? (
        <SpectatorResults teams={teams} versus={versus} ends={ends} />
      ) : (
        <section
          className={styles.views}
          aria-label={pl.spectate.viewsLabel}
          data-layout={layout}
          data-count={shown.length}
        >
          {shown.map((team, slot) => (
            // Keyed by slot: a canvas that switches newsrooms keeps its WebGL context.
            <ViewPane
              // biome-ignore lint/suspicious/noArrayIndexKey: one canvas per slot, on purpose.
              key={slot}
              view={teamView(team)}
              slot={slot}
              primary={slot === 0}
              compact={compact}
              versus={versus}
              plateAction={plateAction(team)}
              followed={followed?.team === team ? followed : null}
              onFollow={actions.tapPlayer}
            />
          ))}
        </section>
      )}

      {connection === 'reconnecting' && (
        <p className={styles.banner} role="status">
          {pl.game.reconnecting}
        </p>
      )}

      <footer className={styles.footer} hidden={statsOpen}>
        <div className={styles.footerLeft}>
          {feedShown && (
            <EventFeed
              visible={phoneSize ? FEED_VISIBLE_PHONE : FEED_VISIBLE_DESKTOP}
              versus={versus}
            />
          )}
          {!ended && <KeyHint hint={hint} />}
        </div>
        <div className={styles.buttons}>
          {!ended && (
            <Button
              icon={<Icon name="gauge" size={24} />}
              aria-haspopup="dialog"
              data-testid="spectate-stats-open"
              onClick={actions.toggleStats}
            >
              {pl.spectate.stats.open}
            </Button>
          )}
          {(phase === 'results' || ended) && host && (
            <Button
              variant="primary"
              icon={<Icon name="desk" size={24} />}
              data-testid="spectate-back-to-lobby"
              onClick={backToLobby}
            >
              {pl.results.backToLobby}
            </Button>
          )}
          <Button
            back
            icon={<Icon name="leave" size={24} />}
            data-testid="spectate-leave"
            onClick={leaveRoom}
          >
            {pl.spectate.leave}
          </Button>
        </div>
      </footer>
      <StatsSheet
        open={statsOpen && !ended}
        teams={teams}
        versus={versus}
        side={!phoneSize}
        onClose={() => setStatsOpen(false)}
      />
    </main>
  );
}
