// The spectate screen (S7-90), in the lazy game chunk: what a member of the Widownia watches
// while a match is played and once it ended. One GameView canvas per newsroom on screen
// (spectate-layout.ts: side by side, one over the other or one at a time; phones always one,
// with a one-tap team switch), a full-width top-bar scoreboard with both scores always visible,
// and a plate per view with the team's badge and players. Spectator canvases run on the medium
// preset at most, without shadows (scene/quality.ts `spectatorProfile`); sounds follow the
// spectator audio policy (spectate-audio.ts). Follow, feed, stats and the spectator results come
// with S7-91.
import { ENDLESS_LEVEL_ID, type TeamIndex } from '@redakcja/shared';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { formatElapsed } from '../endless/endless-model.ts';
import { useEventFeed } from '../events/EventBanners.tsx';
import { playSound, startAmbience, stopAmbience } from '../fx/audio/audio-manager.ts';
import { requestMusic } from '../fx/audio/music.ts';
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
import styles from './SpectateScreen.module.css';
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

/** A view's header: the team badge and name, and its players. Tapping it focuses the team. */
function TeamPlate({
  team,
  versus,
  action,
}: {
  team: TeamIndex;
  versus: boolean;
  action: { label: string; onPress: () => void } | null;
}) {
  const roster = useApp((s) => s.room?.players);
  const players = (roster ?? []).filter((player) => player.team === team);
  const name = teamName(team, versus);
  const content = (
    <>
      {versus ? <TeamBadge team={team} size={26} /> : <Icon name="eye" size={24} />}
      <span className={styles.plateName}>{name}</span>
      <span className={styles.chips}>
        {players.map((player) => (
          <span
            key={player.id}
            className={`${styles.chip} ${player.connected ? '' : styles.away}`}
            data-testid={`spectate-player-${player.id}`}
          >
            <PlayerMark colorIndex={player.colorIndex} size={16} />
            <span className={styles.chipName}>{player.nickname}</span>
          </span>
        ))}
      </span>
    </>
  );
  if (action) {
    return (
      <button
        type="button"
        className={`${styles.plate} ${styles.plateButton}`}
        aria-label={action.label}
        data-testid={`spectate-plate-${team}`}
        onClick={action.onPress}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={styles.plate} data-testid={`spectate-plate-${team}`}>
      {content}
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
}: {
  view: SpectateView;
  slot: number;
  primary: boolean;
  compact: boolean;
  versus: boolean;
  plateAction: { label: string; onPress: () => void } | null;
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
      <TeamPlate team={view.team} versus={versus} action={plateAction} />
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

/** The keys of a versus split (or of the one-view layout, where they swap the newsroom). */
function KeyHint({ single }: { single: boolean }) {
  const device = useApp((s) => s.inputDevice);
  if (device !== 'keyboard' && device !== 'gamepad') {
    return null;
  }
  const hints = pl.spectate.hints[device];
  return (
    <p className={styles.hint} data-testid="spectate-hint">
      <Icon name={device === 'gamepad' ? 'gamepad' : 'eye'} size={20} />
      {typeset(single ? hints.single : hints.split)}
    </p>
  );
}

export function SpectateScreen() {
  const versus = useApp((s) => s.room?.mode === 'versus');
  const phase = useApp((s) => s.room?.phase);
  const host = useApp((s) => s.room !== null && s.room.hostId === s.playerId);
  const connection = useApp((s) => s.connection);
  const teams = versus ? VERSUS_TEAMS : COOP_TEAMS;
  const size = useViewport();
  const layout: SpectateLayout = chooseSpectateLayout(
    size,
    teams.length,
    isPhoneViewport(size, isCoarsePointer()),
  );
  const [focus, setFocus] = useState<SpectateFocus>('split');
  const shown = visibleTeams(layout, teams, focus);
  const single = shown.length < 2;
  const shownKey = shown.join(',');
  const paneWidth = layout === 'side' && !single ? size.width / 2 : size.width;
  const compact = paneWidth < SPECTATE_COMPACT_VIEW_WIDTH;

  useWakeLock(true);
  useEffect(() => requestMusic('game'), []);
  useEffect(() => {
    startAmbience();
    return stopAmbience;
  }, []);

  // Only the newsrooms on screen are heard: quieter, and to their side while both are shown.
  useEffect(() => {
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
  }, [shownKey]);

  const actions = useMemo(
    () => ({
      intent(intent: NavIntent): boolean {
        if (intent === 'confirm') {
          setFocus((current) => nextFocus(layout, teams, current));
          return teams.length > 1;
        }
        if (intent === 'back') {
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
    }),
    [layout, teams, focus],
  );

  // Gamepad (A toggles the view, B brings both newsrooms back); the d-pad moves between the
  // buttons through the menu navigation, which then presses the one in focus.
  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'confirm' && document.activeElement instanceof HTMLButtonElement) {
      return false;
    }
    return actions.intent(intent);
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) {
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
  }, [actions, teams]);

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

  return (
    <main className={styles.screen} data-testid="spectate-screen" data-layout={layout}>
      <Scoreboard
        teams={teams}
        versus={versus}
        single={layout === 'single'}
        shown={shown}
        onPick={actions.tap}
      />
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
          />
        ))}
      </section>

      {connection === 'reconnecting' && (
        <p className={styles.banner} role="status">
          {pl.game.reconnecting}
        </p>
      )}

      <footer className={styles.footer}>
        {/* Co-op has one newsroom: no key changes the view, so no hint. */}
        {teams.length > 1 && <KeyHint single={layout === 'single'} />}
        <div className={styles.buttons}>
          {phase === 'results' && host && (
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
    </main>
  );
}
