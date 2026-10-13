// Role picker (S7-44): seven compact passes — the six roles and „Bez roli” — each with the role's
// icon, its name and the marks of the teammates who picked it (roles are not exclusive, so the
// marks only say what the team already covers). The chosen pass lifts up with a blue ring and a
// ✓ badge. Under the passes, one detail panel explains the checked role, or the one under the
// mouse or the pad's focus: the passive with the stations it speeds up on this level, the ability
// with its key on the device in use and its cooldown, and a note when either does nothing here.
// Native radios keep keyboard (arrows), gamepad focus and screen-reader behaviour.
import { ROLES, type Role, type StationKind } from '@redakcja/shared';
import { useId, useState } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { KeyCap } from '../../stations/kit.tsx';
import { useApp } from '../../store/app.ts';
import { pl } from '../../strings/pl.ts';
import { typeset } from '../../strings/typography.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { RoleIcon, type RoleIconName } from '../../ui/icons/RoleIcon.tsx';
import { PlayerMark } from '../../ui/PlayerMark.tsx';
import { abilityKeyCap } from '../settings-model.ts';
import styles from './RolePasses.module.css';
import { type RoleSummary, roleSummary, roleSummaryNote } from './role-summary.ts';

const OPTIONS: readonly RoleIconName[] = [...ROLES, 'none'];

/** A teammate as the passes need them: who picked which role, with their mark. */
export type RoleTeammate = {
  id: string;
  nickname: string;
  colorIndex: number;
  role: Role | null;
};

export type RolePassesProps = {
  role: Role | null;
  onChange(role: Role | null): void;
  /** The chosen level's stations: the detail panel names only the stations that are there. */
  levelStations: readonly StationKind[];
  /** The other players in the room (not the local one). */
  teammates: readonly RoleTeammate[];
  disabled?: boolean;
};

function optionName(option: RoleIconName): string {
  return option === 'none' ? pl.lobbyRoles.noRole : pl.vocab.roles[option];
}

function summaryOf(option: RoleIconName, levelStations: readonly StationKind[]) {
  return option === 'none' ? null : roleSummary(option, levelStations);
}

/** The screen-reader description of a pass: the passive and the ability in one sentence each. */
function describe(summary: RoleSummary | null): string {
  if (!summary) {
    return `${pl.lobbyRoles.noRoleBonus}. ${pl.lobbyRoles.noRoleAbility}.`;
  }
  const passive = summary.passive ?? pl.lobbyRoles.noRoleBonus;
  const ability = pl.lobbyRoles.abilityLine(summary.ability.name, summary.ability.what);
  return typeset(`${passive}. ${ability}, ${pl.lobbyRoles.cooldown(summary.ability.cooldownS)}.`);
}

function StationChips({ stations, testId }: { stations: readonly StationKind[]; testId: string }) {
  if (stations.length === 0) {
    return null;
  }
  return (
    <span className={styles.chips} data-testid={testId}>
      {stations.map((station) => (
        <span key={station} className={styles.chip}>
          <Icon name={station} size={20} />
          {pl.guidance.stationShort[station]}
        </span>
      ))}
    </span>
  );
}

function DetailPanel({ option, summary }: { option: RoleIconName; summary: RoleSummary | null }) {
  const device = useApp((s) => s.inputDevice);
  const key = device === 'touch' ? pl.lobbyRoles.touchKey : abilityKeyCap(device);
  const note = summary ? roleSummaryNote(summary) : null;
  return (
    <div className={styles.detail} data-testid="role-detail" data-role={option}>
      <p className={styles.detailName}>
        <span className={styles.detailIcon} aria-hidden="true">
          <RoleIcon role={option} size={24} />
        </span>
        {optionName(option)}
      </p>
      <p className={styles.line} data-testid="role-detail-passive">
        <span className={styles.lineLabel}>
          <Icon name="star" size={20} />
          {pl.lobbyRoles.passiveLabel}
        </span>
        <span className={styles.lineText}>
          {typeset(summary?.passive ?? pl.lobbyRoles.noRoleBonus)}
        </span>
        {summary && <StationChips stations={summary.stations} testId="role-detail-stations" />}
      </p>
      <p className={styles.line} data-testid="role-detail-ability">
        <span className={styles.lineLabel}>
          <Icon name="bolt" size={20} />
          {pl.lobbyRoles.abilityLabel}
        </span>
        {summary ? (
          <>
            <KeyCap>{key}</KeyCap>
            <span className={styles.lineText}>
              <strong>{summary.ability.name}</strong>
              {typeset(` – ${summary.ability.what}`)}
            </span>
            <span className={styles.cooldown}>
              <Icon name="hourglass" size={18} />
              {typeset(pl.lobbyRoles.cooldown(summary.ability.cooldownS))}
            </span>
            <StationChips stations={summary.ability.stations} testId="role-detail-family" />
          </>
        ) : (
          <span className={styles.lineText}>{pl.lobbyRoles.noRoleAbility}</span>
        )}
      </p>
      {note && (
        <p className={styles.note} data-testid="role-note">
          <Icon name="lock" size={20} />
          {typeset(note)}
        </p>
      )}
    </div>
  );
}

export function RolePasses({
  role,
  onChange,
  levelStations,
  teammates,
  disabled = false,
}: RolePassesProps) {
  const groupName = useId();
  const selected: RoleIconName = role ?? 'none';
  const [hovered, setHovered] = useState<RoleIconName | null>(null);
  const [focused, setFocused] = useState<RoleIconName | null>(null);
  const shown = hovered ?? focused ?? selected;
  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend className={styles.title}>{pl.lobbyRoles.passesTitle}</legend>
      <div className={styles.grid} onPointerLeave={() => setHovered(null)}>
        {OPTIONS.map((option) => {
          const checked = option === selected;
          const nameId = `${groupName}-${option}-name`;
          const descId = `${groupName}-${option}-desc`;
          const pickers = teammates.filter((mate) => (mate.role ?? 'none') === option);
          return (
            <label
              key={option}
              className={`${styles.card} ${checked ? styles.chosen : ''} ${
                option === 'none' ? styles.blank : ''
              }`}
              data-testid={`role-pass-${option}`}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') {
                  setHovered(option);
                }
              }}
            >
              <input
                type="radio"
                name={groupName}
                className={styles.native}
                checked={checked}
                aria-labelledby={nameId}
                aria-describedby={descId}
                onFocus={() => setFocused(option)}
                onBlur={() => setFocused(null)}
                onChange={() => {
                  emitCue('ui.click');
                  onChange(option === 'none' ? null : option);
                }}
              />
              <span className={styles.icon} aria-hidden="true">
                <RoleIcon role={option} size={30} />
              </span>
              <span id={nameId} className={styles.name}>
                {optionName(option)}
              </span>
              <span id={descId} className="visually-hidden">
                {describe(summaryOf(option, levelStations))}
                {pickers.length > 0 &&
                  ` ${pl.lobbyRoles.pickedBy(pickers.map((mate) => mate.nickname))}.`}
              </span>
              {pickers.length > 0 && (
                <span className={styles.dots} aria-hidden="true" data-testid="role-pass-dots">
                  {pickers.map((mate) => (
                    <PlayerMark key={mate.id} colorIndex={mate.colorIndex} size={18} />
                  ))}
                </span>
              )}
              {checked && (
                <span className={styles.tick} aria-hidden="true">
                  <Icon name="publish" size={18} />
                </span>
              )}
            </label>
          );
        })}
      </div>
      <DetailPanel option={shown} summary={summaryOf(shown, levelStations)} />
    </fieldset>
  );
}
