// Title screen (design-rules §5): the game logo on the sky, one centred panel with the
// nickname, the yellow "open a room" button and the join-by-code row. Settings sit in a corner;
// minor links sit in the footer under the card and, with ads on, a „Reklama” rail on the left.
// A versus match already under way (`matchInProgress`) offers to watch it instead (S7-84).
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@redakcja/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { AdSlot } from '../ads/AdSlot.tsx';
import { useEncyclopedia } from '../encyclopedia/store.ts';
import { requestMusic } from '../fx/audio/music.ts';
import { useHowTo } from '../howto/store.ts';
import { fetchHealth, type HealthStatus } from '../net/api.ts';
import { joinRoom } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { useFeature, usePublicConfig } from '../store/public-config.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import { GameLogo } from './GameLogo.tsx';
import styles from './MainMenu.module.css';
import { MenuFooter } from './menu/MenuFooter.tsx';
import { MotdBanner } from './menu/MotdBanner.tsx';

const CODE_FILTER = new RegExp(`[^${ROOM_CODE_ALPHABET}]`, 'g');

export function MainMenu() {
  const nickname = useApp((s) => s.nickname);
  const setNickname = useApp((s) => s.setNickname);
  const error = useApp((s) => s.error);
  const connection = useApp((s) => s.connection);
  const setSettingsOpen = useApp((s) => s.setSettingsOpen);
  const lastJoinCode = useApp((s) => s.lastJoinCode);
  const spectators = useFeature('spectators');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const busy = connection === 'connecting';

  useEffect(() => requestMusic('menu'), []);
  useEffect(() => {
    void fetchHealth().then((h) => setHealth(h.status));
    // Back in the menu: pick up MOTD and flag changes without a reload (throttled to 60 s).
    void usePublicConfig.getState().refresh();
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

  function watch() {
    const name = validNickname();
    if (name && lastJoinCode) {
      joinRoom(name, lastJoinCode, 'spectator');
    }
  }

  const serverError = error ? pl.errors[error] : null;
  const message = localError ?? serverError;
  const canWatch =
    localError === null && error === 'matchInProgress' && spectators && lastJoinCode !== null;

  return (
    <main className={styles.page}>
      <div className={styles.corner}>
        <Button
          icon={<Icon name="question" size={28} />}
          data-testid="open-how-to"
          onClick={() => useHowTo.getState().show('intro')}
        >
          <span className={styles.cornerLabel}>{pl.howTo.open}</span>
        </Button>
        <Button
          icon={<Icon name="book" size={26} />}
          data-testid="open-encyclopedia"
          onClick={() => useEncyclopedia.getState().show()}
        >
          <span className={styles.cornerLabel}>{pl.encyclopedia.open}</span>
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

      <MotdBanner className={styles.motd} />

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
        {canWatch && (
          <Button
            icon={<Icon name="eye" size={26} />}
            disabled={busy}
            data-testid="menu-watch"
            onClick={watch}
          >
            {pl.menu.watchAction}
          </Button>
        )}
        {health && health !== 'ok' && (
          <p className={styles.error} role="status">
            <Icon name="expired" size={22} />
            {pl.menu.pressDown}
          </p>
        )}
      </section>

      <MenuFooter className={styles.footer} />

      {/* Fixed left rail; renders nothing without ads, on phones or below 1180×680 (S7-74). */}
      <AdSlot placement="menu" />
    </main>
  );
}
