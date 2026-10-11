// The collectible card, in two sizes: a sticker tile for the grid and the big card with the
// reading material. Locked cards are grey silhouettes that show "???" and a hint, and never
// give away the trick. Examples list only stories the player has met (no spoilers).
import { getStory, LEVELS, type Technique } from '@redakcja/content';
import type { CSSProperties } from 'react';
import { pl } from '../strings/pl.ts';
import { typeset } from '../strings/typography.ts';
import { Icon } from '../ui/icons/Icon.tsx';
import { cardIcon } from './card-icons.ts';
import styles from './Encyclopedia.module.css';
import { type CardView, levelNumberOfStory } from './model.ts';

const TRUE_CARD = 'none';

/** The accent of a card: green for the "this one is true" card, blue (information) otherwise. */
function accent(technique: Technique): CSSProperties {
  return {
    '--card-accent': technique.id === TRUE_CARD ? 'var(--green)' : 'var(--blue)',
  } as CSSProperties;
}

export function CardTile({
  view,
  index,
  selected,
  onSelect,
  tabIndex,
  buttonRef,
}: {
  view: CardView<Technique>;
  index: number;
  selected: boolean;
  onSelect(): void;
  tabIndex: number;
  buttonRef(element: HTMLButtonElement | null): void;
}) {
  const { technique, unlocked } = view;
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`${styles.tile} ${unlocked ? '' : styles.tileLocked} ${selected ? styles.tileSelected : ''}`}
      style={accent(technique)}
      aria-pressed={selected}
      aria-label={unlocked ? technique.name : pl.encyclopedia.lockedLabel(index + 1)}
      tabIndex={tabIndex}
      data-testid={`technique-${technique.id}`}
      data-unlocked={unlocked}
      onClick={onSelect}
    >
      <span className={styles.tileBadge}>
        <Icon name={cardIcon(technique)} size={30} />
      </span>
      <span className={styles.tileName}>
        {unlocked ? typeset(technique.name) : pl.encyclopedia.locked}
      </span>
    </button>
  );
}

function levelLabel(storyId: string): string | null {
  const number = levelNumberOfStory(storyId);
  const level = LEVELS.find((l) => l.id.startsWith(`l${number}-`));
  return number !== null && level ? typeset(pl.encyclopedia.level(number, level.title)) : null;
}

export function CardDetail({ view }: { view: CardView<Technique> }) {
  const { technique, unlocked, stories } = view;
  const icon = cardIcon(technique);

  if (!unlocked) {
    return (
      <article
        className={`${styles.card} ${styles.cardLocked}`}
        aria-label={pl.encyclopedia.lockedName}
        data-testid="technique-detail"
      >
        <header className={styles.cardHead}>
          <span className={styles.cardBadge}>
            <Icon name={icon} size={44} />
          </span>
          <h3 className={styles.cardName}>{pl.encyclopedia.locked}</h3>
        </header>
        <p className={styles.hint}>
          <Icon name="lock" size={24} />
          {typeset(technique.hint)}
        </p>
        <p className={styles.lockedBody}>{pl.encyclopedia.lockedBody}</p>
      </article>
    );
  }

  return (
    <article
      className={styles.card}
      style={accent(technique)}
      aria-labelledby="technique-name"
      data-testid="technique-detail"
    >
      <header className={styles.cardHead}>
        <span className={styles.cardBadge}>
          <Icon name={icon} size={44} />
        </span>
        <h3 id="technique-name" className={styles.cardName}>
          {typeset(technique.name)}
        </h3>
      </header>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Icon name="lightbulb" size={22} />
          {pl.encyclopedia.sections.how}
        </h4>
        <p className={styles.text}>{typeset(technique.how)}</p>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Icon name="imageSearch" size={22} />
          {pl.encyclopedia.sections.detect}
        </h4>
        <p className={styles.text}>{typeset(technique.detect)}</p>
        <ul className={styles.chips}>
          {technique.stations.map((station) => (
            <li key={station} className={styles.chip}>
              <Icon name={station} size={22} />
              {pl.vocab.stations[station]}
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Icon name="globe" size={22} />
          {pl.encyclopedia.sections.realWorld}
        </h4>
        <p className={styles.text}>{typeset(technique.realWorld)}</p>
      </section>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <Icon name="folder" size={22} />
          {pl.encyclopedia.sections.met}
        </h4>
        <ul className={styles.examples}>
          {stories.map((storyId) => {
            const story = getStory(storyId);
            if (!story) {
              return null;
            }
            const level = levelLabel(storyId);
            return (
              <li key={storyId} className={styles.example}>
                <span className={styles.exampleHeadline}>{typeset(story.headline)}</span>
                {level && <span className={styles.exampleLevel}>{level}</span>}
              </li>
            );
          })}
        </ul>
      </section>
    </article>
  );
}
