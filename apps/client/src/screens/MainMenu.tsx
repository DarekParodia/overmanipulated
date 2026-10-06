// Main menu as the front page of the Kurier Nowobrzeski (design-rules §1): masthead, lead
// headline, and the two ways in as article columns.
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@redakcja/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { fetchHealth, type HealthStatus } from '../net/api.ts';
import { joinRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { formatDate, formatWeekday, typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './MainMenu.module.css';

const CODE_FILTER = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g');

/** Edition number: days since the fictional paper's first issue. */
function editionNumber(date: Date): number {
  const first = new Date(1991, 4, 3);
  return Math.floor((date.getTime() - first.getTime()) / 86_400_000);
}

export function MainMenu() {
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const error = useApp((s) => s.error);
  const connection = useApp((s) => s.connection);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const today = new Date();
  const busy = connection === 'connecting';

  useEffect(() => {
    void fetchHealth().then((h) => setHealth(h.status));
  }, []);

  function validNickname(): string | null {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setLocalError(pl.menu.needByline);
      return null;
    }
    setLocalError(null);
    return trimmed;
  }

  function create() {
    const name = validNickname();
    if (name) {
      joinRoom(name);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const name = validNickname();
    if (!name) {
      return;
    }
    if (code.length !== ROOM_CODE_LENGTH) {
      setLocalError(pl.menu.needCode);
      return;
    }
    joinRoom(name, code);
  }

  const serverError = error ? pl.errors[error] : null;

  return (
    <main className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.dateline}>
          <span className="label">
            {formatWeekday(today)}, {formatDate(today)}
          </span>
          <span className="label">{pl.masthead.edition(editionNumber(today))}</span>
          <span className="label">{pl.masthead.price}</span>
          <Button
            variant="quiet"
            icon={<Icon name="settings" size={20} />}
            onClick={() => setSettingsOpen(true)}
          >
            {pl.menu.settings}
          </Button>
        </div>
        <p className={styles.paperName}>{pl.masthead.paper}</p>
        <p className={styles.motto}>{pl.masthead.motto}</p>
      </header>

      <section className={styles.lead}>
        <h1 className={styles.headline}>{pl.menu.headline}</h1>
        <p className={styles.lede}>{typeset(pl.menu.lede)}</p>
      </section>

      <div className={styles.columns}>
        <section className={styles.byline}>
          <Field
            label={pl.menu.bylineLabel}
            placeholder={pl.menu.bylinePlaceholder}
            hint={typeset(pl.menu.bylineHint)}
            value={nickname}
            maxLength={16}
            autoComplete="nickname"
            onChange={(event) => setNickname(event.target.value)}
          />
        </section>

        <section className={styles.article}>
          <p className="label">{pl.menu.createKicker}</p>
          <h2 className={styles.articleTitle}>{typeset(pl.menu.createTitle)}</h2>
          <Button variant="stamp" disabled={busy} onClick={create}>
            {pl.menu.createAction}
          </Button>
        </section>

        <form className={styles.article} onSubmit={join}>
          <p className="label">{pl.menu.joinKicker}</p>
          <h2 className={styles.articleTitle}>{pl.menu.joinTitle}</h2>
          <Field
            label={pl.menu.joinCodeLabel}
            large
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(CODE_FILTER, ''))}
          />
          <Button type="submit" disabled={busy}>
            {pl.menu.joinAction}
          </Button>
        </form>

        <aside className={styles.side}>
          <p className="label">{pl.menu.sideKicker}</p>
          <p className={styles.sideText}>{typeset(pl.menu.sideText)}</p>
          {health && health !== 'ok' && (
            <p className={styles.press} role="status">
              {pl.menu.pressDown}
            </p>
          )}
        </aside>
      </div>

      {(localError || serverError) && (
        <p className={styles.error} role="alert">
          {localError ?? serverError}
        </p>
      )}
    </main>
  );
}
