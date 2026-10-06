// Role picker as a row of newsroom press passes pinned to the cork board: each pass has the
// paper's masthead band, a "photo" box with the role's accessory, the role name and its bonus
// typed underneath. The chosen pass is clipped on (lifted, with a metal clip and a tick).
// Native radios keep keyboard (arrows) and screen-reader behaviour.
import { ROLE_STATIONS, ROLE_WORK_TIME_FACTOR, ROLES, type Role } from '@redakcja/shared';
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { bindOrphans } from '../../strings/typography.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import { RoleIcon, type RoleIconName } from '../../ui/icons/RoleIcon.tsx';
import styles from './RolePasses.module.css';

type Option = { value: RoleIconName; name: string; bonus: string };

/** The bonus line, derived from the balance constants so the pass never contradicts the sim. */
function roleBonus(role: Role): string {
  const special: Partial<Record<Role, string>> = pl.lobbyRoles.specialBonuses;
  return (
    special[role] ??
    pl.lobbyRoles.fasterAt(
      ROLE_STATIONS[role].map((station) => pl.vocab.stations[station]),
      Math.round((1 - ROLE_WORK_TIME_FACTOR) * 100),
    )
  );
}

const OPTIONS: readonly Option[] = [
  ...ROLES.map((role) => ({
    value: role,
    name: pl.vocab.roles[role],
    bonus: roleBonus(role),
  })),
  { value: 'none', name: pl.lobbyRoles.noRole, bonus: pl.lobbyRoles.noRoleBonus },
];

export type RolePassesProps = {
  role: Role | null;
  onChange(role: Role | null): void;
  /** Shows the design doc's rule for rooms without a managing editor. */
  showEditorNote: boolean;
  disabled?: boolean;
};

export function RolePasses({ role, onChange, showEditorNote, disabled = false }: RolePassesProps) {
  const groupName = useId();
  const selected: RoleIconName = role ?? 'none';
  return (
    <fieldset className={styles.passes} disabled={disabled}>
      <span className={styles.pin} aria-hidden="true" />
      <legend className={styles.title}>{pl.lobbyRoles.passesTitle}</legend>
      <p className={styles.hint}>{bindOrphans(pl.lobbyRoles.passesHint)}</p>
      <div className={styles.grid}>
        {OPTIONS.map((option, index) => {
          const checked = option.value === selected;
          const nameId = `${groupName}-${option.value}-name`;
          const bonusId = `${groupName}-${option.value}-bonus`;
          return (
            <label
              key={option.value}
              className={`${styles.pass} ${checked ? styles.chosen : ''} ${
                option.value === 'none' ? styles.blank : ''
              }`}
              style={{ ['--tilt' as string]: `${((index * 53) % 5) - 2}deg` }}
              data-testid={`role-pass-${option.value}`}
            >
              <input
                type="radio"
                name={groupName}
                className={styles.native}
                checked={checked}
                aria-labelledby={nameId}
                aria-describedby={bonusId}
                onChange={() => {
                  emitCue('ui.click');
                  onChange(option.value === 'none' ? null : option.value);
                }}
              />
              <span className={styles.clip} aria-hidden="true" />
              <span className={styles.band} aria-hidden="true">
                {pl.lobbyRoles.passHeader}
              </span>
              <span className={styles.body}>
                <span className={styles.photo}>
                  <RoleIcon role={option.value} size={30} />
                </span>
                <span id={nameId} className={styles.name}>
                  {option.name}
                </span>
              </span>
              <span id={bonusId} className={styles.bonus}>
                {bindOrphans(option.bonus)}
              </span>
              {checked && (
                <span className={styles.tick} aria-hidden="true">
                  <Icon name="publish" size={22} />
                </span>
              )}
            </label>
          );
        })}
      </div>
      {showEditorNote && <p className={styles.note}>{bindOrphans(pl.lobbyRoles.noEditorNote)}</p>}
    </fieldset>
  );
}
