// Title screen (design-rules §5): the game logo on the sky, one centred panel with the
// nickname, the yellow "open a room" button and the join-by-code row. Settings sit in a corner.
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@redakcja/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { useEncyclopedia } from '../encyclopedia/store.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { fetchHealth, type HealthStatus } from '../net/api.ts';
import { joinRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { GameLogo } from './GameLogo.tsx';
import styles from './MainMenu.module.css';

const CODE_FILTER = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g');

export function MainMenu() {
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const error = useApp((s) => s.error);
  const connection = useApp((s) => s.connection);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const busy = connection === 'connecting';

  useEffect(() => requestMusic('menu'), []);
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
  const message = localError ?? serverError;

  return (
    <main className={styles.page}>
      <div className={styles.corner}>
        <Button
          icon={<Icon name="book" size={26} />}
          data-testid="open-encyclopedia"
          onClick={() => useEncyclopedia.getState().show()}
        >
          {pl.encyclopedia.open}
        </Button>
        <Button
          icon={<Icon name="settings" size={28} label={pl.menu.settings} />}
          onClick={() => setSettingsOpen(true)}
        />
      </div>

      <header className={styles.header}>
        <GameLogo />
        <p className={styles.tagline}>{pl.menu.tagline}</p>
      </header>

      <section className={`panel ${styles.card}`}>
        <Field
          label={pl.menu.bylineLabel}
          placeholder={pl.menu.bylinePlaceholder}
          value={nickname}
          maxLength={16}
          autoComplete="nickname"
          onChange={(event) => setNickname(event.target.value)}
        />

        <Button variant="primary" big wide disabled={busy} onClick={create}>
          {pl.menu.createAction}
        </Button>

        <p className={styles.or}>
          <span>{pl.menu.or}</span>
        </p>

        <form className={styles.join} onSubmit={join}>
          <Field
            label={pl.menu.joinCodeLabel}
            large
            placeholder={pl.menu.joinCodePlaceholder}
            value={code}
            maxLength={ROOM_CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            inputMode="text"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(CODE_FILTER, ''))}
          />
          <Button type="submit" big disabled={busy}>
            {pl.menu.joinAction}
          </Button>
        </form>

        {message && (
          <p className={styles.error} role="alert">
            <Icon name="reject" size={22} />
            {message}
          </p>
        )}
        {health && health !== 'ok' && (
          <p className={styles.error} role="status">
            <Icon name="expired" size={22} />
            {pl.menu.pressDown}
          </p>
        )}
      </section>
    </main>
  );
}
