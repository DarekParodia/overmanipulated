// „Encyklopedia technik”: a modal sheet with the collectible cards. Wide screens show the sticker
// grid on the left and the selected card on the right; portrait phones show one at a time.
// Keyboard (arrows / WASD, Enter, Esc), gamepad (d-pad, A, B) and touch all work; one yellow
// „Gotowe” closes it. Opened from the main menu and the lobby, or from the „Nowa karta!” chip.
import { TECHNIQUES } from '@redakcja/content';
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMediaQuery } from '../debrief/use-media-query.ts';
import { emitCue } from '../fx/feedback.ts';
import { type NavIntent, useInputCapture, useNavIntent } from '../input/ui-nav.ts';
import { pl } from '../strings/pl.ts';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/icons/Icon.tsx';
import styles from './Encyclopedia.module.css';
import { cardViews, gridStep, unlockedCount } from './model.ts';
import { useEncyclopedia } from './store.ts';
import { CardDetail, CardTile } from './TechniqueCard.tsx';

/** Portrait phones: the grid and the card do not fit side by side. */
const SINGLE_QUERY = '(max-width: 640px) and (orientation: portrait)';

const KEY_INTENTS: Readonly<Record<string, NavIntent>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

export function EncyclopediaScreen() {
  const open = useEncyclopedia((s) => s.open);
  const hide = useEncyclopedia((s) => s.hide);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
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
      aria-labelledby="encyclopedia-title"
      data-testid="encyclopedia"
    >
      {open && <EncyclopediaSheet onClose={hide} />}
    </dialog>
  );
}

function EncyclopediaSheet({ onClose }: { onClose(): void }) {
  const met = useEncyclopedia((s) => s.met);
  const focusId = useEncyclopedia((s) => s.focusId);
  const views = useMemo(() => cardViews(TECHNIQUES, met), [met]);
  const single = useMediaQuery(SINGLE_QUERY);
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      views.findIndex((view) => view.technique.id === focusId),
    ),
  );
  // Portrait phones: false shows the grid, true the selected card.
  const [reading, setReading] = useState(() => focusId !== null);
  const grid = useRef<HTMLFieldSetElement>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const detail = useRef<HTMLDivElement>(null);
  const total = views.length;
  const view = views[selected];

  function columns(): number {
    const template = grid.current ? getComputedStyle(grid.current).gridTemplateColumns : '';
    return Math.max(1, template.split(' ').filter(Boolean).length);
  }

  function move(intent: NavIntent) {
    const next = gridStep(selected, intent, columns(), total);
    if (next !== selected) {
      emitCue('ui.hover');
      setSelected(next);
      tiles.current[next]?.focus({ preventScroll: false });
    }
  }

  function choose(index: number) {
    setSelected(index);
    setReading(true);
    detail.current?.scrollTo({ top: 0 });
  }

  function back() {
    if (single && reading) {
      setReading(false);
      tiles.current[selected]?.focus();
    } else {
      onClose();
    }
  }

  useInputCapture(true);
  useNavIntent((intent) => {
    if (intent === 'back') {
      back();
    } else if (intent === 'confirm') {
      setReading(true);
    } else if (intent === 'up' || intent === 'down' || intent === 'left' || intent === 'right') {
      if (single && reading) {
        detail.current?.scrollBy({ top: intent === 'down' ? 80 : intent === 'up' ? -80 : 0 });
      } else {
        move(intent);
      }
    }
    return true;
  });

  // The input manager may not be attached (menus), so the sheet reads the keys itself and keeps
  // them from reaching the world behind it.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const intent = KEY_INTENTS[event.code];
    if (!intent || event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }
    event.preventDefault();
    event.nativeEvent.stopPropagation();
    if (single && reading) {
      detail.current?.scrollBy({ top: intent === 'down' ? 80 : intent === 'up' ? -80 : 0 });
    } else {
      move(intent);
    }
  }

  // Opens on the focused card; the selected tile scrolls into view and takes focus.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once on open
  useEffect(() => {
    tiles.current[selected]?.focus({ preventScroll: true });
    tiles.current[selected]?.scrollIntoView({ block: 'nearest' });
  }, []);

  const showGrid = !single || !reading;
  const showDetail = !single || reading;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move the selection of the tiles inside
    <div
      className={`panel ${styles.sheet}`}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => KEY_INTENTS[event.code] && event.nativeEvent.stopPropagation()}
    >
      <header className={styles.header}>
        <h2 id="encyclopedia-title" className={styles.title}>
          <Icon name="book" size={32} />
          {pl.encyclopedia.title}
        </h2>
        <span
          className={styles.count}
          role="status"
          aria-label={pl.encyclopedia.collectedLabel(unlockedCount(views), total)}
          data-testid="encyclopedia-count"
        >
          <Icon name="star" size={20} style={{ '--icon-fill': 'var(--yellow)' } as CSSProperties} />
          {pl.encyclopedia.collected(unlockedCount(views), total)}
        </span>
        <Button
          variant="primary"
          icon={<Icon name={single && reading ? 'arrow' : 'check'} size={24} />}
          onClick={back}
        >
          {single && reading ? pl.encyclopedia.backToCards : pl.encyclopedia.done}
        </Button>
      </header>

      <div className={styles.body}>
        {showGrid && (
          <fieldset ref={grid} className={styles.grid}>
            <legend className="visually-hidden">{pl.encyclopedia.gridLabel}</legend>
            {views.map((item, index) => (
              <CardTile
                key={item.technique.id}
                view={item}
                index={index}
                selected={index === selected}
                tabIndex={index === selected ? 0 : -1}
                buttonRef={(element) => {
                  tiles.current[index] = element;
                }}
                onSelect={() => choose(index)}
              />
            ))}
          </fieldset>
        )}
        {showDetail && view && (
          <div ref={detail} className={styles.detail} aria-live="polite">
            <CardDetail key={view.technique.id} view={view} />
          </div>
        )}
      </div>
    </div>
  );
}
