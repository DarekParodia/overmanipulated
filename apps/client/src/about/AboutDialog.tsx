// „O grze” (S7-103): a lazy modal dialog with three tabs.
// - „Gra”: authors and copyright from the LICENSE, a licence summary, the privacy note link and
//   the version (package + git sha + protocol), all from the build (`about/app-info.ts`).
// - „Zasoby”: CREDITS.md fetched at runtime and rendered from the markdown-lite AST, with an
//   error state and a retry when offline, plus the intro voice credit read from its sprite.
// - „Biblioteki”: `about/libraries.ts`.
// One yellow „Gotowe” closes it. Keyboard (Tab, Enter, Esc; arrows scroll the focused panel),
// gamepad (d-pad, A, B; Y switches tabs; up/down scroll the focused panel) and touch all work.
// A centred panel on desktop, a full-screen sheet on phones (the „Jak grać” pattern).
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Segmented } from '../endless/Leaderboard.tsx';
import { emitCue } from '../fx/feedback.ts';
import { handleMenuIntent } from '../input/menu-nav.ts';
import { useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { loadVoiceSprite, type VoiceSprite } from '../intro/voice-sprite.ts';
import { PRIVACY_PATH } from '../screens/menu/MenuFooter.tsx';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Icon, type IconName } from '../ui/icons/Icon.tsx';
import { LinkButton } from '../ui/LinkButton.tsx';
import styles from './About.module.css';
import { APP_INFO } from './app-info.ts';
import { LIBRARIES, type LibrarySide, librariesOf } from './libraries.ts';
import { Markdown } from './Markdown.tsx';
import { type CreditsState, loadCredits, scrollTarget, voiceCreditLine } from './model.ts';
import { ABOUT_TABS, type AboutTab, nextAboutTab, useAbout } from './store.ts';

const TAB_ICON: Record<AboutTab, IconName> = {
  game: 'article',
  credits: 'music',
  libraries: 'book',
};

const TAB_OPTIONS = ABOUT_TABS.map((id) => ({ id, label: pl.about.tabs[id], icon: TAB_ICON[id] }));

const SIDES: readonly LibrarySide[] = ['client', 'server'];

export function AboutDialog() {
  const open = useAbout((s) => s.open);
  const hide = useAbout((s) => s.hide);
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
      // Esc closes natively; it gets the same back sound as B and „Gotowe”.
      onCancel={() => emitCue('ui.back')}
      aria-labelledby="about-title"
      data-testid="about"
      // Keys belong to the dialog: the game's own key handler must not see them.
      onKeyDown={(event) => event.nativeEvent.stopPropagation()}
    >
      {open && <AboutSheet />}
    </dialog>
  );
}

function AboutSheet() {
  const tab = useAbout((s) => s.tab);
  const setTab = useAbout((s) => s.setTab);
  const hide = useAbout((s) => s.hide);
  const device = useApp((s) => s.inputDevice);
  const sheet = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLElement>(null);

  function focusActiveTab() {
    sheet.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
  }

  function switchTab(next: AboutTab) {
    if (next !== tab) {
      emitCue('ui.click');
      setTab(next);
      // The focus follows the tab (a pad's Y), so the d-pad goes on from there.
      requestAnimationFrame(focusActiveTab);
    }
  }

  // Opens with the active tab focused, so the pad and the keyboard start at the top.
  useEffect(focusActiveTab, []);

  // A new tab starts at its top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tab` is the trigger.
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [tab]);

  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'back') {
      emitCue('ui.back');
      hide();
      return true;
    }
    if (intent === 'alt') {
      switchTab(nextAboutTab(tab, 1));
      return true;
    }
    // With the panel focused, up / down scroll it first; at its end they move the focus on.
    const panel = body.current;
    if (panel && document.activeElement === panel && (intent === 'up' || intent === 'down')) {
      const top = scrollTarget(
        panel.scrollTop,
        panel.clientHeight,
        panel.scrollHeight,
        intent === 'down' ? 1 : -1,
      );
      if (top !== null) {
        panel.scrollTo({ top });
        return true;
      }
    }
    handleMenuIntent(intent);
    return true;
  });

  return (
    <div ref={sheet} className={`panel ${styles.sheet}`}>
      <header className={styles.header}>
        <h2 id="about-title" className={styles.title}>
          <Icon name="heart" size={32} />
          {pl.about.title}
        </h2>
        <div className={styles.tabs}>
          <Segmented<AboutTab>
            label={pl.about.tabsLabel}
            value={tab}
            options={TAB_OPTIONS}
            onChange={switchTab}
            testId="about-tab"
          />
        </div>
        <Button
          variant="primary"
          back
          icon={<Icon name="check" size={24} />}
          data-testid="about-close"
          onClick={hide}
        >
          {pl.about.close}
        </Button>
      </header>

      <section
        ref={body}
        className={styles.body}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrolling text panel takes the focus, so the keyboard and the pad can scroll it.
        tabIndex={0}
        aria-label={pl.about.tabs[tab]}
        data-testid={`about-panel-${tab}`}
      >
        {tab === 'game' && <GameTab />}
        {tab === 'credits' && <CreditsTab />}
        {tab === 'libraries' && <LibrariesTab />}
      </section>

      {device === 'gamepad' && <p className={styles.padHint}>{pl.about.padHint}</p>}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
  testId,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section className={styles.section} data-testid={testId}>
      <h3 className={styles.sectionTitle}>
        <Icon name={icon} size={26} />
        {title}
      </h3>
      {children}
    </section>
  );
}

function GameTab() {
  return (
    <div className={styles.column}>
      <Section icon="heart" title={pl.about.authors} testId="about-authors">
        <ul className={styles.authors}>
          {APP_INFO.authors.map((author) => (
            <li key={author}>{author}</li>
          ))}
        </ul>
      </Section>
      <Section icon="lock" title={pl.about.licence} testId="about-licence">
        <p className={styles.strong}>{typeset(APP_INFO.copyright)}</p>
        <p>{typeset(pl.about.licenceSummary)}</p>
      </Section>
      <Section icon="user" title={pl.about.privacy} testId="about-privacy">
        <p>{typeset(pl.about.privacyBody)}</p>
        <div className={styles.actions}>
          <LinkButton
            href={PRIVACY_PATH}
            variant="secondary"
            icon={<Icon name="user" size={22} />}
            data-testid="about-privacy-link"
          >
            {typeset(pl.about.privacyLink)}
          </LinkButton>
        </div>
      </Section>
      <Section icon="flag" title={pl.about.version} testId="about-version">
        <p className={styles.version}>
          {pl.about.versionLine(APP_INFO.version, APP_INFO.protocol)}
        </p>
      </Section>
    </div>
  );
}

function CreditsTab() {
  const [credits, setCredits] = useState<CreditsState>({ status: 'loading' });
  const [voice, setVoice] = useState<VoiceSprite | null | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is the retry trigger.
  useEffect(() => {
    let live = true;
    setCredits({ status: 'loading' });
    void loadCredits().then((state) => {
      if (live) {
        setCredits(state);
      }
    });
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    let live = true;
    void loadVoiceSprite().then((sprite) => {
      if (live) {
        setVoice(sprite);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={styles.column} data-testid="about-credits" data-status={credits.status}>
      {credits.status === 'loading' && (
        <p className={styles.note} role="status">
          <Icon name="hourglass" size={22} />
          {pl.about.creditsLoading}
        </p>
      )}
      {credits.status === 'error' && (
        <div className={styles.error} role="alert" data-testid="about-credits-error">
          <p>
            <Icon name="expired" size={22} />
            {typeset(pl.about.creditsError)}
          </p>
          <Button
            icon={<Icon name="retry" size={22} />}
            data-testid="about-retry"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {pl.about.retry}
          </Button>
        </div>
      )}
      {credits.status === 'ready' && (
        <div className={styles.markdown}>
          <Markdown blocks={credits.blocks} />
        </div>
      )}
      {voice !== undefined && (
        <Section icon="sound" title={pl.about.voiceHeading} testId="about-voice">
          <p>{typeset(voiceCreditLine(voice))}</p>
        </Section>
      )}
    </div>
  );
}

function LibrariesTab() {
  return (
    <div className={styles.column} data-testid="about-libraries" data-count={LIBRARIES.length}>
      <p className={styles.lead}>{typeset(pl.about.librariesLead)}</p>
      {SIDES.map((side) => (
        <Section
          key={side}
          icon={side === 'client' ? 'globe' : 'bolt'}
          title={pl.about.sides[side]}
        >
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{pl.about.libraryColumns.name}</th>
                  <th scope="col">{pl.about.libraryColumns.licence}</th>
                </tr>
              </thead>
              <tbody>
                {librariesOf(side).map((library) => (
                  <tr key={library.name}>
                    <td>
                      <code className={styles.code}>{library.name}</code>
                    </td>
                    <td>{library.licence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}
