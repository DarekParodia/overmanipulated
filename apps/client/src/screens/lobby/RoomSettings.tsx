// Room settings row of the lobby (S7-86): the room's name, its visibility and the mode. The host
// gets a name field (committed on Enter or when it loses focus) and two chip switches built from
// native radios, like the difficulty picker (keyboard, the pad's menu navigator and touch alike);
// the chosen chip is blue (selection), so the footer keeps the only yellow action. Guests see the
// name and two read-only chips. „Publiczny” exists only while the server offers the room browser,
// and „Na punkty” only while versus is on; without a choice the host sees the chip too.
import {
  ROOM_NAME_MAX_LENGTH,
  type RoomMode,
  type RoomStateMessage,
  type RoomVisibility,
} from '@redakcja/shared';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { Field } from '../../ui/Field.tsx';
import { Icon, type IconName } from '../../ui/icons/Icon.tsx';
import { nameToSend, roomTitle } from './lobby-model.ts';
import styles from './RoomSettings.module.css';

const MODE_ICON: Record<RoomMode, IconName> = { coop: 'hand', versus: 'trophy' };
const VISIBILITY_ICON: Record<RoomVisibility, IconName> = { private: 'lock', public: 'globe' };

type Option<T extends string> = { id: T; label: string; icon: IconName };

/** A row of radio chips with a hidden legend; the chosen one is blue and ticked. */
function ChoiceChips<T extends string>({
  legend,
  value,
  options,
  disabled,
  testId,
  onChange,
}: {
  legend: string;
  value: T;
  options: readonly Option<T>[];
  disabled: boolean;
  testId: string;
  onChange(id: T): void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.choices} disabled={disabled} data-testid={testId}>
      <legend className="visually-hidden">{legend}</legend>
      {options.map((option) => {
        const checked = option.id === value;
        return (
          <label
            key={option.id}
            className={`${styles.chip} ${checked ? styles.chosen : ''}`}
            data-testid={`${testId}-${option.id}`}
          >
            <input
              type="radio"
              name={name}
              className={styles.native}
              checked={checked}
              onChange={() => {
                emitCue('ui.click');
                onChange(option.id);
              }}
            />
            <Icon name={checked ? 'check' : option.icon} size={20} />
            {option.label}
          </label>
        );
      })}
    </fieldset>
  );
}

/** A read-only chip: what the host chose. */
function StateChip({ icon, label, testId }: { icon: IconName; label: string; testId: string }) {
  return (
    <span className={styles.state} data-testid={testId}>
      <Icon name={icon} size={20} />
      {label}
    </span>
  );
}

/** The host's name field: a local draft while typing, the room's name otherwise. */
function NameField({
  name,
  disabled,
  onCommit,
}: {
  name: string | null;
  disabled: boolean;
  onCommit(name: string | null): void;
}) {
  const [draft, setDraft] = useState(name ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) {
      setDraft(name ?? '');
    }
  }, [name, editing]);

  function commit() {
    setEditing(false);
    const next = nameToSend(draft);
    if (next !== name) {
      onCommit(next);
    }
  }

  return (
    <form
      className={styles.nameForm}
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        commit();
      }}
    >
      <Field
        label={pl.lobbyRoom.nameLabel}
        placeholder={pl.lobbyRoom.namePlaceholder}
        value={draft}
        maxLength={ROOM_NAME_MAX_LENGTH}
        autoComplete="off"
        enterKeyHint="done"
        disabled={disabled}
        data-testid="room-name"
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          setEditing(true);
          setDraft(event.target.value);
        }}
        onBlur={commit}
      />
    </form>
  );
}

export type RoomSettingsProps = {
  room: Pick<
    RoomStateMessage,
    'hostId' | 'mode' | 'name' | 'players' | 'spectators' | 'spectatorsAllowed' | 'visibility'
  >;
  isHost: boolean;
  disabled: boolean;
  /** Feature flags from the public config. */
  versusOn: boolean;
  roomBrowserOn: boolean;
  onName(name: string | null): void;
  onVisibility(visibility: RoomVisibility): void;
  onMode(mode: RoomMode): void;
};

export function RoomSettings({
  room,
  isHost,
  disabled,
  versusOn,
  roomBrowserOn,
  onName,
  onVisibility,
  onMode,
}: RoomSettingsProps) {
  const visibilityOptions: Option<RoomVisibility>[] = (['private', 'public'] as const)
    .filter((v) => v === 'private' || roomBrowserOn || room.visibility === 'public')
    .map((v) => ({ id: v, label: pl.vocab.visibility[v], icon: VISIBILITY_ICON[v] }));
  const modeOptions: Option<RoomMode>[] = (['coop', 'versus'] as const)
    .filter((m) => m === 'coop' || versusOn || room.mode === 'versus')
    .map((m) => ({ id: m, label: pl.vocab.modes[m], icon: MODE_ICON[m] }));

  return (
    <section className={styles.room} aria-label={pl.lobbyRoom.settingsTitle}>
      <div className={styles.name}>
        {isHost ? (
          <NameField name={room.name} disabled={disabled} onCommit={onName} />
        ) : (
          <p className={styles.title} data-testid="room-title">
            {roomTitle(room)}
          </p>
        )}
      </div>
      <div className={styles.setting}>
        {isHost && visibilityOptions.length > 1 ? (
          <ChoiceChips
            legend={pl.lobbyRoom.visibilityLabel}
            value={room.visibility}
            options={visibilityOptions}
            disabled={disabled}
            testId="room-visibility"
            onChange={onVisibility}
          />
        ) : (
          <StateChip
            icon={VISIBILITY_ICON[room.visibility]}
            label={pl.vocab.visibility[room.visibility]}
            testId="room-visibility-chip"
          />
        )}
        <span className={`${styles.hint} ${styles.minorHint}`}>
          {pl.lobbyRoom.visibilityHints[room.visibility]}
        </span>
      </div>
      <div className={styles.setting}>
        {isHost && modeOptions.length > 1 ? (
          <ChoiceChips
            legend={pl.lobbyRoom.modeLabel}
            value={room.mode}
            options={modeOptions}
            disabled={disabled}
            testId="room-mode"
            onChange={onMode}
          />
        ) : (
          <StateChip
            icon={MODE_ICON[room.mode]}
            label={pl.vocab.modes[room.mode]}
            testId="room-mode-chip"
          />
        )}
        <span className={styles.hint} data-testid="room-mode-hint">
          {pl.lobbyRoom.modeHints[room.mode]}
        </span>
      </div>
    </section>
  );
}
