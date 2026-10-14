// The round „more” button on another member's card or Widownia chip (S7-87): only the host sees
// it, and it opens the manage sheet. A full touch target, though it sits inside a small card.
import { emitCue } from '../../fx/feedback.ts';
import { Icon } from '../../ui/icons/Icon.tsx';
import styles from './MoreButton.module.css';

export type MoreButtonProps = {
  /** Accessible name, e.g. „Opcje: Bartek”. */
  label: string;
  disabled?: boolean;
  testId?: string;
  onClick(): void;
};

export function MoreButton({ label, disabled = false, testId, onClick }: MoreButtonProps) {
  return (
    <button
      type="button"
      className={styles.more}
      aria-label={label}
      title={label}
      disabled={disabled}
      data-testid={testId}
      onClick={() => {
        emitCue('ui.click');
        onClick();
      }}
    >
      <Icon name="more" size={24} />
    </button>
  );
}
