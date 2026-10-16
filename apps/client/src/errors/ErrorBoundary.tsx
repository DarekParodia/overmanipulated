// Catches a render error anywhere under the app. Without it React unmounts the whole tree and the
// page goes blank with no signal. The boundary reports the error to the server log
// (net/client-errors.ts) and shows one way out: reload. The error state is not a player action,
// so it has no feedback cue.
import { Component, type CSSProperties, type ReactNode, useEffect } from 'react';
import { attachInput } from '../input/input-manager.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { describeError, reportClientError } from '../net/client-errors.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './ErrorBoundary.module.css';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    reportClientError({ ...describeError(error), source: 'boundary' });
  }

  override render(): ReactNode {
    return this.state.failed ? <ErrorFallback /> : this.props.children;
  }
}

/**
 * The fallback panel: one line and one yellow button. It uses no app context, so it still draws
 * when the failure took the providers down with it.
 */
export function ErrorFallback() {
  // App's menu navigation and key listeners went down with the tree, so the fallback attaches
  // them and captures input itself: the pad's south button and Enter / Space (the one confirm)
  // reload too, as on every menu screen.
  useEffect(() => attachInput(), []);
  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent !== 'confirm') {
      return false;
    }
    reloadPage();
    return true;
  });
  return (
    <main className={styles.screen}>
      <section className={`panel ${styles.panel}`}>
        <Icon name="siren" size={56} style={{ '--icon-fill': 'var(--red)' } as CSSProperties} />
        <p className={styles.line} role="alert">
          {typeset(pl.errorFallback.line)}
        </p>
        <Button variant="primary" big icon={<Icon name="retry" />} onClick={reloadPage}>
          {pl.errorFallback.reload}
        </Button>
      </section>
    </main>
  );
}

function reloadPage(): void {
  window.location.reload();
}
