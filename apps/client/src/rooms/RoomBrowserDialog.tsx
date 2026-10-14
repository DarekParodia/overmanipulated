// Room browser (S7-88): the public rooms of this server as a modal dialog, opened from the main
// menu when the `roomBrowser` flag is on. A search field („Kod, nazwa lub gospodarz”) and three
// filters (mode, status, difficulty; behind a „Filtry” toggle on phones), the rooms as a radio
// list (blue selection) with every summary field, and one yellow „Dołącz” (only for a room with
// a free seat in its lobby) plus a white „Oglądaj” (only for a room whose Widownia has a seat);
// neither shows until a room is picked.
// An empty nickname brings the nickname field into the dialog. The list polls every 8 s while
// open and visible (`useRoomList`). Keyboard (Tab, arrows in the list, Enter, Esc), gamepad
// (menu-nav: d-pad, A, B) and touch all work; a full-screen sheet on phones.
import { LEVELS } from '@redakcja/content';
import {
  DIFFICULTIES,
  type Difficulty,
  ENDLESS_LEVEL_ID,
  NICKNAME_MAX_LENGTH,
  ROOM_SEARCH_MAX_LENGTH,
  type RoomListStatus,
  type RoomMode,
  type RoomSummary,
} from '@redakcja/shared';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Segmented } from '../endless/Leaderboard.tsx';
import { emitCue } from '../fx/feedback.ts';
import { joinRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import fieldStyles from '../ui/Field.module.css';
import { Field } from '../ui/Field.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import styles from './RoomBrowser.module.css';
import {
  activeFilterCount,
  isFiltered,
  keepSelection,
  NO_ROOM_FILTERS,
  ROOM_SEARCH_DEBOUNCE_MS,
  type RoomListFilters,
  roomAgeMinutes,
} from './room-list-model.ts';
import { useRoomBrowser } from './store.ts';
import { useRoomList } from './use-room-list.ts';

/** Razem: people side by side; Na punkty: the trophy two newsrooms play for. */
export const ROOM_MODE_ICON: Record<RoomMode, IconName> = { coop: 'heart', versus: 'trophy' };

const MODE_OPTIONS: readonly { id: RoomMode | 'any'; label: string; icon?: IconName }[] = [
  { id: 'any', label: pl.rooms.any },
  { id: 'coop', label: pl.rooms.modes.coop, icon: ROOM_MODE_ICON.coop },
  { id: 'versus', label: pl.rooms.modes.versus, icon: ROOM_MODE_ICON.versus },
];

const STATUS_OPTIONS: readonly { id: RoomListStatus; label: string; icon?: IconName }[] = [
  { id: 'any', label: pl.rooms.any },
  { id: 'open', label: pl.rooms.statuses.open, icon: 'hourglass' },
  { id: 'inGame', label: pl.rooms.statuses.inGame, icon: 'play' },
];

const DIFFICULTY_OPTIONS: readonly { id: Difficulty | 'any'; label: string }[] = [
  { id: 'any', label: pl.rooms.any },
  ...DIFFICULTIES.map((id) => ({ id, label: pl.difficulty.names[id] })),
];

const LEVEL_TITLES = new Map(LEVELS.map((level) => [level.id, level.title]));

function levelTitle(levelId: string): string {
  return levelId === ENDLESS_LEVEL_ID ? pl.endless.title : (LEVEL_TITLES.get(levelId) ?? levelId);
}

function roomTitle(room: RoomSummary): string {
  return room.name ?? pl.rooms.untitled(room.hostNickname);
}

export function RoomBrowserDialog() {
  const open = useRoomBrowser((s) => s.open);
  const hide = useRoomBrowser((s) => s.hide);
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) {
      return;
    }
    if (open && !element.open) {
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={hide}
      // Esc closes natively (B too, through menu-nav); it gets the back sound like the ✗.
      onCancel={() => emitCue('ui.back')}
      aria-labelledby="room-browser-title"
      data-testid="room-browser"
    >
      {open && <RoomBrowserSheet />}
    </dialog>
  );
}

/** The search text the list asks for: the field's value once typing paused. */
function useDebounced(value: string, ms: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function RoomBrowserSheet() {
  const hide = useRoomBrowser((s) => s.hide);
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const connection = useApp((s) => s.connection);
  const error = useApp((s) => s.error);
  const [filters, setFilters] = useState<RoomListFilters>(NO_ROOM_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // Shown when the dialog opened without a nickname (or a join found none); it stays while
  // the player types, so the field never vanishes under their fingers.
  const [askName, setAskName] = useState(() => nickname.trim() === '');
  const [nameMissing, setNameMissing] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const q = useDebounced(filters.q, ROOM_SEARCH_DEBOUNCE_MS);
  const list = useRoomList({ ...filters, q }, true);
  const busy = connection === 'connecting';
  const searchId = useId();
  const filtersId = useId();

  const current = keepSelection(selected, list.rooms);
  const room = list.rooms.find((candidate) => candidate.code === current) ?? null;
  const filterCount = activeFilterCount(filters);

  function update(patch: Partial<RoomListFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
  }

  function enter(as: 'player' | 'spectator') {
    if (!room) {
      return;
    }
    const name = nickname.trim();
    setAttempted(true);
    if (!name) {
      setAskName(true);
      setNameMissing(true);
      return;
    }
    setNameMissing(false);
    // The lobby (or the Widownia) replaces the menu; the host closes the dialog on that.
    joinRoom(name, room.code, as);
  }

  const joinError = attempted && !busy && error ? pl.errors[error] : null;
  const message = nameMissing ? pl.menu.needByline : joinError;

  return (
    <div className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="room-browser-title" className={styles.title}>
          <Icon name="globe" size={32} />
          {pl.rooms.title}
        </h2>
        <Button
          back
          data-testid="room-browser-close"
          icon={<Icon name="reject" size={24} label={pl.rooms.close} />}
          onClick={hide}
        />
      </header>

      <div className={styles.tools}>
        <div className={styles.search}>
          <label htmlFor={searchId} className="visually-hidden">
            {pl.rooms.searchLabel}
          </label>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" size={24} />
          </span>
          <input
            id={searchId}
            type="search"
            className={`${fieldStyles.input} ${styles.searchInput}`}
            placeholder={pl.rooms.searchPlaceholder}
            value={filters.q}
            maxLength={ROOM_SEARCH_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            data-testid="room-search"
            onChange={(event) => update({ q: event.target.value })}
          />
        </div>
        {askName && (
          <div className={styles.name}>
            <Field
              label={pl.menu.bylineLabel}
              // Phones hide the label to keep one row: the placeholder must say what goes in.
              placeholder={pl.menu.bylineLabel}
              value={nickname}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="nickname"
              data-testid="room-browser-nickname"
              onChange={(event) => setNickname(event.target.value)}
            />
          </div>
        )}
        <span className={styles.filterToggle}>
          <Button
            icon={<Icon name="gauge" size={22} />}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            data-testid="room-filters-toggle"
            onClick={() => setFiltersOpen((value) => !value)}
          >
            {pl.rooms.filters(filterCount)}
          </Button>
        </span>
      </div>

      <div
        id={filtersId}
        className={styles.filters}
        data-open={filtersOpen}
        data-testid="room-filters"
      >
        <Segmented
          label={pl.rooms.filterLabels.mode}
          value={filters.mode}
          options={MODE_OPTIONS}
          onChange={(mode) => update({ mode })}
          testId="room-filter-mode"
        />
        <Segmented
          label={pl.rooms.filterLabels.status}
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(status) => update({ status })}
          testId="room-filter-status"
        />
        <Segmented
          label={pl.rooms.filterLabels.difficulty}
          value={filters.difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={(difficulty) => update({ difficulty })}
          lead="gauge"
          testId="room-filter-difficulty"
        />
      </div>

      <div className={styles.body} data-testid="room-list" data-status={list.status}>
        {list.status === 'loading' && (
          <p className={styles.state} role="status">
            <Icon name="hourglass" size={32} />
            {pl.rooms.loading}
          </p>
        )}
        {list.status === 'error' && list.problem && (
          <div className={styles.problem} role="alert" data-testid="room-list-error">
            <p>
              <Icon name="expired" size={24} />
              {pl.rooms.problems[list.problem]}
            </p>
            {list.problem !== 'unavailable' && (
              <Button
                icon={<Icon name="retry" size={22} />}
                data-testid="room-list-retry"
                onClick={list.retry}
              >
                {pl.rooms.retry}
              </Button>
            )}
          </div>
        )}
        {list.status === 'ready' && list.rooms.length === 0 && (
          <div className={styles.state} data-testid="room-list-empty">
            <Icon name="globe" size={32} />
            {isFiltered(filters) ? (
              <>
                <p>{pl.rooms.filteredEmpty}</p>
                <Button
                  variant="ghost"
                  icon={<Icon name="reject" size={22} />}
                  onClick={() => setFilters(NO_ROOM_FILTERS)}
                >
                  {pl.rooms.clearFilters}
                </Button>
              </>
            ) : (
              <>
                <p>{pl.rooms.empty}</p>
                <p className={styles.soft}>{typeset(pl.rooms.emptyHint)}</p>
              </>
            )}
          </div>
        )}
        {list.status === 'ready' && list.rooms.length > 0 && (
          <fieldset className={styles.list}>
            <legend className="visually-hidden">{pl.rooms.title}</legend>
            {list.rooms.map((summary) => (
              <RoomRow
                key={summary.code}
                room={summary}
                checked={summary.code === current}
                onSelect={() => {
                  emitCue('ui.click');
                  setSelected(summary.code);
                }}
              />
            ))}
          </fieldset>
        )}
        {list.status === 'ready' && list.total > list.rooms.length && (
          <p className={styles.more}>{pl.rooms.more(list.rooms.length, list.total)}</p>
        )}
      </div>

      <footer className={styles.footer}>
        <div className={styles.footerNote}>
          {message ? (
            <p className={styles.error} role="alert" data-testid="room-browser-error">
              <Icon name="reject" size={22} />
              {message}
            </p>
          ) : list.status === 'ready' && list.problem ? (
            <p className={styles.stale} role="status" data-testid="room-list-stale">
              <Icon name="expired" size={22} />
              {pl.rooms.problems[list.problem]}
            </p>
          ) : room ? (
            !room.canJoinAsPlayer &&
            !room.canSpectate && (
              <p className={styles.stale} data-testid="room-no-seat">
                <Icon name="lock" size={22} />
                {pl.rooms.noSeat}
              </p>
            )
          ) : (
            list.rooms.length > 0 && <p className={styles.soft}>{pl.rooms.pick}</p>
          )}
        </div>
        {room?.canSpectate && (
          <Button
            icon={<Icon name="eye" size={24} />}
            disabled={busy}
            data-testid="room-watch"
            onClick={() => enter('spectator')}
          >
            {pl.rooms.watch}
          </Button>
        )}
        {room?.canJoinAsPlayer && (
          <Button
            variant="primary"
            big
            disabled={busy}
            data-testid="room-join"
            onClick={() => enter('player')}
          >
            {pl.rooms.join}
          </Button>
        )}
      </footer>
    </div>
  );
}

function RoomRow({
  room,
  checked,
  onSelect,
}: {
  room: RoomSummary;
  checked: boolean;
  onSelect(): void;
}) {
  const detailsId = useId();
  const minutes = roomAgeMinutes(room.createdAt, Date.now());
  const title = roomTitle(room);
  return (
    <label
      className={`${styles.row} ${checked ? styles.rowOn : ''}`}
      data-testid={`room-row-${room.code}`}
      data-can-join={room.canJoinAsPlayer}
      data-can-spectate={room.canSpectate}
    >
      <input
        type="radio"
        name="room-browser"
        className={styles.native}
        checked={checked}
        aria-label={title}
        aria-describedby={detailsId}
        onChange={onSelect}
      />
      <span className={styles.modeIcon} aria-hidden="true">
        <Icon name={ROOM_MODE_ICON[room.mode]} size={28} />
      </span>
      <span className={styles.rowTitle}>{title}</span>
      <span className={styles.rowMeta}>
        {pl.rooms.host(room.hostNickname)}
        <span aria-hidden="true"> · </span>
        {pl.rooms.code(room.code)}
        <span aria-hidden="true"> · </span>
        <span title={pl.rooms.ageLabel(minutes)}>{pl.rooms.age(minutes)}</span>
      </span>
      <span id={detailsId} className={styles.chips}>
        <span className={styles.chip}>
          <Icon name={ROOM_MODE_ICON[room.mode]} size={20} />
          {pl.rooms.modes[room.mode]}
        </span>
        <span className={styles.chip}>{levelTitle(room.levelId)}</span>
        <span className={styles.chip}>
          <Icon name="gauge" size={20} />
          {pl.difficulty.names[room.difficulty]}
        </span>
        <span className={styles.chip}>
          <Icon name="user" size={20} />
          <span className="visually-hidden">
            {pl.rooms.playersLabel(room.players, room.maxPlayers)}
          </span>
          <span aria-hidden="true">{pl.rooms.players(room.players, room.maxPlayers)}</span>
        </span>
        {room.spectatorsAllowed ? (
          <span className={styles.chip}>
            <Icon name="eye" size={20} />
            <span className="visually-hidden">{pl.rooms.spectatorsLabel(room.spectators)}</span>
            <span aria-hidden="true">{room.spectators}</span>
          </span>
        ) : (
          <span className={`${styles.chip} ${styles.chipOff}`}>
            <Icon name="lock" size={20} />
            <span className="visually-hidden">{pl.rooms.spectatorsClosed}</span>
            <Icon name="eye" size={20} />
          </span>
        )}
        {room.inGame ? (
          <span className={styles.chip} data-testid="room-in-game">
            <Icon name="play" size={20} />
            {pl.rooms.inGame}
          </span>
        ) : (
          !room.canJoinAsPlayer && (
            <span className={`${styles.chip} ${styles.chipOff}`}>
              <Icon name="lock" size={20} />
              {pl.rooms.full}
            </span>
          )
        )}
      </span>
    </label>
  );
}
