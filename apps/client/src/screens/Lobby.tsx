// Lobby (design-rules §5): the room code big in a pill, the room settings (name, visibility,
// mode; S7-86), the players as a row of cards or, in Na punkty, two newsroom columns, the
// Widownia strip, the role picker, the difficulty (S7-25), the level, and one main action —
// "Gotowy" for guests, "Do składu!" for the host, "Do gry" for a guest watching from the
// Widownia while a seat is free. The host manages the other members from a sheet behind each
// card's „more” button, and everyone reads „Szczegóły” of the level (S7-87).
import { getLevel } from '@redakcja/content';
import {
  MAX_PLAYERS,
  MAX_ROOM_PLAYERS,
  type Role,
  STATION_KINDS,
  type TeamIndex,
} from '@redakcja/shared';
import { useEffect, useRef, useState } from 'react';
import { AdSlot } from '../ads/AdSlot.tsx';
import { useEncyclopedia } from '../encyclopedia/store.ts';
import { LeaderboardDialog } from '../endless/LeaderboardDialog.tsx';
import { requestMusic } from '../fx/audio/music.ts';
import { emitCue } from '../fx/feedback.ts';
import { useHowTo } from '../howto/store.ts';
import { hostChanged, modeSwitched, teamSwitches } from '../net/room-diff.ts';
import {
  kick,
  leaveRoom,
  selectLevel,
  setDifficulty,
  setMode,
  setReady,
  setRole,
  setRoomName,
  setSpectator,
  setSpectatorsAllowed,
  setTeam,
  setVisibility,
  startGame,
  transferHost,
} from '../net/session.ts';
import { selfKind, type UiError, useApp } from '../store/app.ts';
import { useFeature } from '../store/public-config.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Lobby.module.css';
import { DifficultyPicker } from './lobby/DifficultyPicker.tsx';
import { LevelCard } from './lobby/LevelCard.tsx';
import { LevelDetailsSheet } from './lobby/LevelDetailsSheet.tsx';
import { canWatch, hasFreeSeat, startGate } from './lobby/lobby-model.ts';
import { MemberSheet } from './lobby/MemberSheet.tsx';
import { PlayerCard } from './lobby/PlayerCard.tsx';
import { ReadyToggle } from './lobby/ReadyToggle.tsx';
import { RolePasses } from './lobby/RolePasses.tsx';
import { RoomSettings } from './lobby/RoomSettings.tsx';
import { SpectatorStrip } from './lobby/SpectatorStrip.tsx';
import { TeamColumns } from './lobby/TeamColumns.tsx';

/**
 * Server errors a lobby action can answer with; shown next to the main action. The room actions
 * of S7-77 (teams, Widownia, name, kick) add theirs (S7-84).
 */
export const LOBBY_ERRORS: ReadonlySet<UiError> = new Set<UiError>([
  'notReady',
  'notHost',
  'unknownLevel',
  'teamFull',
  'teamEmpty',
  'spectatorsFull',
  'spectatorsOff',
  'invalidTarget',
  'invalidName',
  'kickCooldown',
  'featureDisabled',
]);

/** Clears a previous lobby error before the next action, so a stale reason never lingers. */
function act(action: () => void): void {
  const { error } = useApp.getState();
  if (error && LOBBY_ERRORS.has(error)) {
    useApp.setState({ error: null });
  }
  action();
}

/** Plays the ready cue when someone else gets ready (own toggles cue on press). */
function useRemoteReadyCue(playerId: string | null): void {
  const players = useApp((s) => s.room?.players);
  const readyBefore = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ready = new Set((players ?? []).filter((p) => p.ready).map((p) => p.id));
    const before = readyBefore.current;
    readyBefore.current = ready;
    if (before && [...ready].some((id) => id !== playerId && !before.has(id))) {
      emitCue('lobby.ready');
    }
  }, [players, playerId]);
}

/** Guests hear a click when the host picks another difficulty (their chip pops with it). */
function useRemoteDifficultyCue(isHost: boolean): void {
  const difficulty = useApp((s) => s.room?.difficulty);
  const before = useRef(difficulty);
  useEffect(() => {
    if (
      before.current !== undefined &&
      difficulty !== undefined &&
      difficulty !== before.current &&
      !isHost
    ) {
      emitCue('ui.click');
    }
    before.current = difficulty;
  }, [difficulty, isHost]);
}

/**
 * Everyone hears the host switch the mode and a player change newsroom (S7-86) and the host role
 * move (S7-87), from the roomState diff, so a press and a remote change sound alike.
 */
function useRoomCues(): void {
  const room = useApp((s) => s.room);
  const before = useRef(room);
  useEffect(() => {
    const previous = before.current;
    before.current = room;
    if (!room) {
      return;
    }
    if (modeSwitched(previous, room)) {
      emitCue('lobby.modeSwitch');
    } else if (teamSwitches(previous, room).length > 0) {
      emitCue('lobby.teamSwitch');
    }
    if (hostChanged(previous, room)) {
      emitCue('lobby.hostChanged');
    }
  }, [room]);
}

export function Lobby() {
  const room = useApp((s) => s.room);
  const playerId = useApp((s) => s.playerId);
  const connection = useApp((s) => s.connection);
  const error = useApp((s) => s.error);
  const run = useApp((s) => s.run);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const versusOn = useFeature('versus');
  const spectatorsOn = useFeature('spectators');
  const roomBrowserOn = useFeature('roomBrowser');
  const [copied, setCopied] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** The member whose manage sheet is open (host only, S7-87). */
  const [managedId, setManagedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => requestMusic('menu'), []);
  useEffect(
    () => () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    },
    [],
  );
  useRemoteReadyCue(playerId);
  useRemoteDifficultyCue(room !== null && room.hostId === playerId);
  useRoomCues();

  if (!room) {
    return null;
  }
  const isHost = room.hostId === playerId;
  const me = room.players.find((p) => p.id === playerId);
  const watching = selfKind(room, playerId) === 'spectator';
  const versus = room.mode === 'versus';
  const empty = Math.max(0, MAX_PLAYERS - room.players.length);
  const online = connection === 'online';
  // Start gate (the server enforces the same rules and answers `notReady` / `teamEmpty`): every
  // connected guest is ready and every newsroom has a connected player.
  const { canStart, reason: startReason } = startGate(room, online);
  const seatFree = hasFreeSeat(room);
  const lobbyError = error && LOBBY_ERRORS.has(error) ? pl.errors[error] : null;
  // The detail panel names only the stations of the chosen level (endless: its preview's).
  const levelStations = getLevel(room.levelId)?.stations ?? STATION_KINDS;
  // In Na punkty only the own newsroom's role choices matter (the rival plays its own run).
  const teammates = room.players.filter((p) => p.id !== playerId && p.team === me?.team);
  const manage = isHost ? setManagedId : undefined;

  async function copyCode() {
    if (!room) {
      return;
    }
    try {
      await navigator.clipboard.writeText(room.roomCode);
      emitCue('ui.copy');
      setCopied(true);
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the code is large enough to read aloud.
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <section className={styles.codePill} aria-labelledby="room-code-label">
          <span id="room-code-label" className={styles.codeLabel}>
            {pl.lobby.codeLabel}
          </span>
          <span className={styles.code} data-testid="room-code">
            {room.roomCode}
          </span>
          <Button
            icon={<Icon name={copied ? 'publish' : 'copy'} size={24} label={pl.lobby.copy} />}
            onClick={copyCode}
          />
          <span className="visually-hidden" aria-live="polite">
            {copied ? pl.lobby.copied : ''}
          </span>
        </section>
        <div className={styles.topActions}>
          <Button
            icon={<Icon name="settings" size={24} label={pl.lobby.settings} />}
            onClick={() => setSettingsOpen(true)}
          />
          <Button
            icon={<Icon name="question" size={24} />}
            data-testid="open-how-to"
            onClick={() => useHowTo.getState().show('intro')}
          >
            <span className={styles.actionLabel}>{pl.howTo.open}</span>
          </Button>
          <Button
            icon={<Icon name="book" size={24} />}
            data-testid="open-encyclopedia"
            onClick={() => useEncyclopedia.getState().show()}
          >
            {pl.encyclopedia.open}
          </Button>
          <Button icon={<Icon name="trophy" size={24} />} onClick={() => setBoardOpen(true)}>
            {pl.leaderboard.open}
          </Button>
          <Button back icon={<Icon name="leave" size={24} />} onClick={leaveRoom}>
            {pl.lobby.leave}
          </Button>
        </div>
      </header>
      <LeaderboardDialog
        open={boardOpen}
        roomCode={room.roomCode}
        difficulty={room.difficulty}
        onClose={() => setBoardOpen(false)}
      />
      <LevelDetailsSheet
        open={detailsOpen}
        levelId={room.levelId}
        mode={room.mode}
        difficulty={room.difficulty}
        run={run}
        onClose={() => setDetailsOpen(false)}
      />
      <MemberSheet
        room={room}
        selfId={playerId}
        targetId={managedId}
        spectatorsOn={spectatorsOn}
        disabled={!online}
        onClose={() => setManagedId(null)}
        onMove={(team, id) => act(() => setTeam(team, id))}
        onSpectator={(spectator, id) => act(() => setSpectator(spectator, id))}
        onMakeHost={(id) => act(() => transferHost(id))}
        onKick={(id) => act(() => kick(id))}
      />

      <RoomSettings
        room={room}
        isHost={isHost}
        disabled={!online}
        versusOn={versusOn}
        roomBrowserOn={roomBrowserOn}
        onName={(name) => act(() => setRoomName(name))}
        onVisibility={(visibility) => act(() => setVisibility(visibility))}
        onMode={(mode) => act(() => setMode(mode))}
      />

      <section
        className={styles.players}
        aria-labelledby="players-title"
        data-testid="lobby-players"
        data-mode={room.mode}
      >
        <h1 id="players-title" className={styles.sectionTitle}>
          {pl.lobby.playersCount(room.players.length, versus ? MAX_ROOM_PLAYERS : MAX_PLAYERS)}
        </h1>
        {versus ? (
          <TeamColumns
            players={room.players}
            hostId={room.hostId}
            selfId={playerId}
            disabled={!online}
            onJoin={(team: TeamIndex) => act(() => setTeam(team))}
            onManage={manage}
          />
        ) : (
          <ol className={styles.cards}>
            {room.players.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isMe={player.id === playerId}
                isHost={player.id === room.hostId}
                onManage={manage && player.id !== playerId ? () => manage(player.id) : undefined}
                manageDisabled={!online}
              />
            ))}
            {Array.from({ length: empty }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: empty seats have no identity.
              <li key={`empty-${i}`} className={styles.emptySeat}>
                {pl.lobby.emptySlot}
              </li>
            ))}
          </ol>
        )}
      </section>

      <SpectatorStrip
        spectators={room.spectators}
        spectatorsAllowed={room.spectatorsAllowed}
        selfId={playerId}
        isHost={isHost}
        featureOn={spectatorsOn}
        disabled={!online}
        canWatch={canWatch(room, playerId, spectatorsOn)}
        canPlay={watching && isHost && seatFree}
        onAllowed={(allowed) => act(() => setSpectatorsAllowed(allowed))}
        onWatch={() => act(() => setSpectator(true))}
        onPlay={() => act(() => setSpectator(false))}
        onManage={manage}
      />

      {/* Spectators pick no role: they do not play (S7-86). */}
      {!watching && (
        <RolePasses
          role={me?.role ?? null}
          disabled={!online}
          levelStations={levelStations}
          teammates={teammates}
          onChange={(role: Role | null) => act(() => setRole(role))}
        />
      )}

      {isHost && (
        <DifficultyPicker
          difficulty={room.difficulty}
          disabled={!online}
          onChange={(difficulty) => act(() => setDifficulty(difficulty))}
        />
      )}

      <footer className={styles.bottom}>
        <LevelCard
          levelId={room.levelId}
          difficulty={room.difficulty}
          runFolders={run?.folders ?? null}
          isHost={isHost}
          disabled={!online}
          onSelect={(levelId) => act(() => selectLevel(levelId))}
          onDetails={() => setDetailsOpen(true)}
        />
        <div className={styles.action}>
          {isHost ? (
            <Button
              variant="primary"
              big
              onClick={() => act(startGame)}
              disabled={!canStart}
              aria-describedby={startReason ? 'start-reason' : undefined}
            >
              {pl.lobby.start}
            </Button>
          ) : watching ? (
            seatFree && (
              <Button
                variant="primary"
                big
                icon={<Icon name="play" size={26} />}
                disabled={!online}
                data-testid="to-players"
                onClick={() => act(() => setSpectator(false))}
              >
                {pl.lobbyRoom.toPlayers}
              </Button>
            )
          ) : (
            <ReadyToggle
              ready={me?.ready ?? false}
              disabled={!online}
              onChange={(ready) => act(() => setReady(ready))}
            />
          )}
          {isHost && startReason && (
            <p id="start-reason" className={styles.reason} data-testid="start-reason">
              {startReason}
            </p>
          )}
          {!isHost && me?.ready && <p className={styles.reason}>{pl.lobby.waitingForHost}</p>}
          {!isHost && watching && (
            <p className={styles.reason} data-testid="spectator-waiting">
              <Icon name="eye" size={22} />
              {pl.lobbyRoom.spectatorWaiting}
            </p>
          )}
          {lobbyError && (
            <p className={styles.error} role="alert">
              {lobbyError}
            </p>
          )}
        </div>
      </footer>

      {/* Banner ≥ --space-ad-gap under the footer; nothing without ads or on phones (S7-74). */}
      <AdSlot placement="lobby" />
    </main>
  );
}
