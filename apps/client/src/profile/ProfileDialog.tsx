// „Profil” (S7-104): this browser's player profile in a lazy modal dialog. Left, „Wygląd”: a
// preview (the player mark in the chosen colour, the accessory glyph, the nickname), the colour
// swatches (colour + shape, S5-05) and the accessory chips; in a room the look reaches the other
// players at once and a colour a teammate holds is crossed out (S7-105). Right, „Statystyki”:
// six tiles from the profile counters, the stars per difficulty from the campaign progress, the
// „only in this browser” note and „Wyczyść statystyki” behind a confirm step. One yellow
// „Gotowe” closes it. Keyboard (Tab, arrows in a radio group, Enter, Esc), gamepad (d-pad, A, B)
// and touch all work; a centred panel on desktop, a full-screen sheet on phones.
import { LEVELS } from '@redakcja/content';
import { ACCESSORIES, type Accessory, PLAYER_COLOR_COUNT, takenColors } from '@redakcja/shared';
import {
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { emitCue } from '../fx/feedback.ts';
import { handleMenuIntent } from '../input/menu-nav.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { useApp } from '../store/app.ts';
import { useProfile } from '../store/profile.ts';
import { accuracy, favouriteRole } from '../store/profile-model.ts';
import { starTotals, useProgress } from '../store/progress.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { AccessoryIcon } from '../ui/icons/AccessoryIcon.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { RoleIcon } from '../ui/icons/RoleIcon.tsx';
import { PlayerMark } from '../ui/PlayerMark.tsx';
import { playerColorVar } from '../ui/tokens.ts';
import styles from './Profile.module.css';

const COLOR_INDICES = Array.from({ length: PLAYER_COLOR_COUNT }, (_, index) => index);
const LEVEL_IDS = LEVELS.map((level) => level.id);

/** The accessory glyph takes the player's colour (player identity, design-rules §3). */
function tint(colorIndex: number): CSSProperties {
  return { '--icon-fill': playerColorVar(colorIndex) } as CSSProperties;
}

export function ProfileDialog() {
  const open = useProfile((s) => s.open);
  const hide = useProfile((s) => s.hide);
  const dialog = useRef<HTMLDialogElement>(null);
  // „Wyczyść statystyki” asks first; Esc and B cancel the question before closing the dialog.
  const [confirming, setConfirming] = useState(false);

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

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (confirming) {
      event.preventDefault();
      emitCue('ui.back');
      setConfirming(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      onClose={() => {
        // The next opening starts without the question.
        setConfirming(false);
        hide();
      }}
      onCancel={onCancel}
      aria-labelledby="profile-title"
      data-testid="profile"
      // Keys belong to the dialog: the game's own key handler must not see them.
      onKeyDown={(event) => event.nativeEvent.stopPropagation()}
    >
      {open && <ProfileSheet confirming={confirming} setConfirming={setConfirming} />}
    </dialog>
  );
}

function ProfileSheet({
  confirming,
  setConfirming,
}: {
  confirming: boolean;
  setConfirming(confirming: boolean): void;
}) {
  const hide = useProfile((s) => s.hide);
  const sheet = useRef<HTMLDivElement>(null);

  // Opens with „Gotowe” focused, so the pad and the keyboard start at the top.
  useEffect(() => {
    sheet.current?.querySelector<HTMLElement>('[data-testid="profile-close"]')?.focus();
  }, []);

  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      if (confirming) {
        setConfirming(false);
      } else {
        hide();
      }
    } else {
      handleMenuIntent(intent);
    }
    return true;
  });

  return (
    <div ref={sheet} className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="profile-title" className={styles.title}>
          <Icon name="trophy" size={32} />
          {pl.profile.title}
        </h2>
        <Button
          variant="primary"
          back
          icon={<Icon name="check" size={24} />}
          data-testid="profile-close"
          onClick={hide}
        >
          {pl.profile.close}
        </Button>
      </header>

      <div className={styles.body}>
        <LookSection />
        <StatsSection confirming={confirming} setConfirming={setConfirming} />
      </div>
    </div>
  );
}

function LookSection() {
  const color = useProfile((s) => s.profile.color);
  const accessory = useProfile((s) => s.profile.accessory);
  const setColor = useProfile((s) => s.setColor);
  const setAccessory = useProfile((s) => s.setAccessory);
  const nickname = useApp((s) => s.nickname).trim();
  const room = useApp((s) => s.room);
  const playerId = useApp((s) => s.playerId);
  const id = useId();
  // In a room (S7-105) the preview and the ticked swatch show the colour the room gave you (so a
  // ticked swatch is never a crossed-out one), and a colour another player of your newsroom holds
  // cannot be picked.
  const me = room?.players.find((p) => p.id === playerId);
  const taken = useMemo(
    () => (room && me ? takenColors(room.players, me.team, me.id) : new Set<number>()),
    [room, me],
  );
  const shown = me?.colorIndex ?? color ?? 0;
  const name = nickname || pl.profile.noNickname;

  return (
    <section className={styles.look} aria-labelledby={`${id}-look`}>
      <h3 id={`${id}-look`} className={styles.sectionTitle}>
        {pl.profile.lookTitle}
      </h3>

      <figure
        className={styles.preview}
        aria-label={pl.profile.previewLabel(name)}
        data-testid="profile-preview"
        data-color={shown}
        data-accessory={accessory}
      >
        <span className={styles.previewArt} aria-hidden="true">
          <PlayerMark colorIndex={shown} size={72} />
          {accessory !== 'none' && (
            <span className={styles.previewAccessory} style={tint(shown)}>
              <AccessoryIcon accessory={accessory} size={44} />
            </span>
          )}
        </span>
        <figcaption className={styles.previewName}>{name}</figcaption>
      </figure>

      <fieldset className={styles.group} data-testid="profile-colors">
        <legend className={styles.legend}>{pl.profile.colorLabel}</legend>
        <span className={styles.swatches}>
          {COLOR_INDICES.map((index) => {
            const checked = index === (me ? me.colorIndex : color);
            const isTaken = taken.has(index);
            const label = pl.profile.colors[index] ?? '';
            return (
              <label
                key={index}
                className={`${styles.swatch} ${checked ? styles.chosen : ''} ${isTaken ? styles.taken : ''}`}
                data-testid={`profile-color-${index}`}
                data-taken={isTaken || undefined}
                title={isTaken ? pl.profile.takenColor : undefined}
              >
                <input
                  type="radio"
                  name={`${id}-color`}
                  className={styles.native}
                  checked={checked}
                  disabled={isTaken}
                  aria-label={isTaken ? pl.profile.takenLabel(label) : label}
                  onChange={() => {
                    emitCue('ui.click');
                    setColor(index);
                  }}
                />
                <PlayerMark colorIndex={index} size={36} />
                {isTaken && (
                  <span className={styles.takenMark} aria-hidden="true">
                    <Icon name="cross" size={32} />
                  </span>
                )}
                {checked && (
                  <span className={styles.tick} aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                )}
              </label>
            );
          })}
        </span>
        {taken.size > 0 && (
          <p className={styles.takenNote} data-testid="profile-taken-note">
            <Icon name="cross" size={18} />
            {pl.profile.takenColor}
          </p>
        )}
      </fieldset>

      <fieldset className={styles.group} data-testid="profile-accessories">
        <legend className={styles.legend}>{pl.profile.accessoryLabel}</legend>
        <span className={styles.chips}>
          {ACCESSORIES.map((option) => (
            <AccessoryChip
              key={option}
              name={`${id}-accessory`}
              accessory={option}
              checked={option === accessory}
              colorIndex={shown}
              onPick={() => setAccessory(option)}
            />
          ))}
        </span>
      </fieldset>
    </section>
  );
}

function AccessoryChip({
  name,
  accessory,
  checked,
  colorIndex,
  onPick,
}: {
  name: string;
  accessory: Accessory;
  checked: boolean;
  colorIndex: number;
  onPick(): void;
}) {
  return (
    <label
      className={`${styles.chip} ${checked ? styles.chosen : ''}`}
      data-testid={`profile-accessory-${accessory}`}
    >
      <input
        type="radio"
        name={name}
        className={styles.native}
        checked={checked}
        onChange={() => {
          emitCue('ui.click');
          onPick();
        }}
      />
      <span className={styles.chipGlyph} style={tint(colorIndex)}>
        <AccessoryIcon accessory={accessory} size={28} />
      </span>
      {pl.profile.accessories[accessory]}
      {checked && (
        <span className={styles.tick} aria-hidden="true">
          <Icon name="check" size={16} />
        </span>
      )}
    </label>
  );
}

function StatsSection({
  confirming,
  setConfirming,
}: {
  confirming: boolean;
  setConfirming(confirming: boolean): void;
}) {
  const profile = useProfile((s) => s.profile);
  const clearStats = useProfile((s) => s.clearStats);
  const best = useProgress((s) => s.best);
  const totals = useMemo(() => starTotals(best, LEVEL_IDS), [best]);
  const [cleared, setCleared] = useState(false);
  const clearArea = useRef<HTMLDivElement>(null);
  const id = useId();
  const percent = accuracy(profile);
  const role = favouriteRole(profile);

  // The question takes the focus to the safe answer; answering gives it back to the button.
  // Nothing moves on opening, where „Gotowe” has the focus.
  const asked = useRef(confirming);
  useEffect(() => {
    if (asked.current === confirming) {
      return;
    }
    asked.current = confirming;
    const target = confirming ? 'profile-clear-cancel' : 'profile-clear';
    clearArea.current?.querySelector<HTMLElement>(`[data-testid="${target}"]`)?.focus();
  }, [confirming]);

  return (
    <section className={styles.stats} aria-labelledby={`${id}-stats`}>
      <h3 id={`${id}-stats`} className={styles.sectionTitle}>
        {pl.profile.statsTitle}
      </h3>

      <dl className={styles.tiles} data-testid="profile-stats">
        <StatTile id="levels" icon={<Icon name="folder" size={26} />} value={profile.levels} />
        <StatTile id="wins" icon={<Icon name="trophy" size={26} />} value={profile.wins} />
        <StatTile
          id="accuracy"
          icon={<Icon name="check" size={26} />}
          value={percent === null ? pl.profile.none : pl.profile.percent(percent)}
        />
        <StatTile
          id="favouriteRole"
          icon={<RoleIcon role={role ?? 'none'} size={26} />}
          value={role ? pl.vocab.roles[role] : pl.profile.none}
          text={role !== null}
        />
        <StatTile id="stamps" icon={<Icon name="stamp" size={26} />} value={profile.stamps} />
        <StatTile
          id="minigameFails"
          icon={<Icon name="cross" size={26} />}
          value={profile.minigameFails}
        />
      </dl>

      <h3 className={styles.sectionTitle}>{pl.profile.starsTitle}</h3>
      <ul className={styles.stars} data-testid="profile-stars">
        {totals.map((total) => {
          const difficulty = pl.difficulty.names[total.difficulty];
          return (
            <li
              key={total.difficulty}
              className={styles.starRow}
              data-difficulty={total.difficulty}
              aria-label={pl.profile.starsLabel(difficulty, total.stars, total.max)}
            >
              <span className={styles.starName} aria-hidden="true">
                {difficulty}
              </span>
              <span className={styles.starCount} aria-hidden="true">
                <Icon name="star" size={22} className={`${styles.starIcon}`} />
                {pl.profile.starsOf(total.stars, total.max)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className={styles.note}>
        <Icon name="lock" size={22} />
        {typeset(pl.profile.localOnly)}
      </p>

      <div ref={clearArea} className={styles.clear}>
        {confirming ? (
          <>
            <Button
              variant="red"
              icon={<Icon name="retry" size={22} />}
              data-testid="profile-clear-confirm"
              onClick={() => {
                clearStats();
                setCleared(true);
                setConfirming(false);
              }}
            >
              {pl.profile.clearConfirm}
            </Button>
            <Button
              back
              icon={<Icon name="close" size={22} />}
              data-testid="profile-clear-cancel"
              onClick={() => setConfirming(false)}
            >
              {pl.profile.clearCancel}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            icon={<Icon name="retry" size={22} />}
            data-testid="profile-clear"
            onClick={() => {
              setCleared(false);
              setConfirming(true);
            }}
          >
            {pl.profile.clear}
          </Button>
        )}
        <span className={styles.status} role="status">
          {cleared ? pl.profile.cleared : ''}
        </span>
      </div>
    </section>
  );
}

type StatId = keyof typeof pl.profile.stats;

function StatTile({
  id,
  icon,
  value,
  text = false,
}: {
  id: StatId;
  icon: ReactNode;
  value: number | string;
  /** A word (the role), set smaller than a number. */
  text?: boolean;
}) {
  return (
    <div className={styles.tile} data-stat={id}>
      <dt className={styles.tileLabel}>
        <span className={styles.tileIcon}>{icon}</span>
        {pl.profile.stats[id]}
      </dt>
      <dd className={`${styles.tileValue} ${text ? styles.tileWord : ''}`}>{value}</dd>
    </div>
  );
}
