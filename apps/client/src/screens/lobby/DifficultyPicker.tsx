// Difficulty picker for the host (S7-25): one row with the label and four secondary chips,
// easiest first, and the chosen difficulty's one-line blurb. Native radios keep the keyboard,
// the pad's menu navigator (left / right, A picks) and screen readers working; the chosen chip
// is blue (selection), so „Do składu!” stays the only yellow action. Guests see the room's
// difficulty as a read-only chip on the level card. The chosen chip also carries a tick, so the
// choice never rests on colour alone.
import { DIFFICULTIES, type Difficulty } from '@redakcja/shared';
import { useId } from 'react';
import { emitCue } from '../../fx/feedback.ts';
import { pl } from '../../strings/pl.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './DifficultyPicker.module.css';

export type DifficultyPickerProps = {
  difficulty: Difficulty;
  onChange(difficulty: Difficulty): void;
  disabled?: boolean;
};

export function DifficultyPicker({
  difficulty,
  onChange,
  disabled = false,
}: DifficultyPickerProps) {
  const id = useId();
  return (
    <fieldset
      className={styles.picker}
      disabled={disabled}
      aria-describedby={`${id}-blurb`}
      data-testid="difficulty-picker"
    >
      <legend className="visually-hidden">{pl.difficulty.label}</legend>
      <span className={styles.label} aria-hidden="true">
        <Icon name="gauge" size={24} />
        {pl.difficulty.label}
      </span>
      <span className={styles.chips}>
        {DIFFICULTIES.map((option) => {
          const checked = option === difficulty;
          return (
            <label
              key={option}
              className={`${styles.chip} ${checked ? styles.chosen : ''}`}
              data-testid={`difficulty-${option}`}
            >
              <input
                type="radio"
                name={id}
                className={styles.native}
                checked={checked}
                onChange={() => {
                  emitCue('ui.click');
                  onChange(option);
                }}
              />
              {checked && <Icon name="check" size={18} />}
              {pl.difficulty.names[option]}
            </label>
          );
        })}
      </span>
      <span id={`${id}-blurb`} className={styles.blurb}>
        {pl.difficulty.blurbs[difficulty]}
      </span>
    </fieldset>
  );
}
