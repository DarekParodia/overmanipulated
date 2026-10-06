// "Księga makiety" — living style guide at ?styleguide (S1-17): tokens, type scale, icons,
// stamps and controls on one page, to review against the design rules on desktop and phone.
import { useState } from 'react';
import { emitCue } from '../fx/feedback.ts';
import { pl } from '../strings/pl.ts';
import { formatDate, formatNumber, typeset } from '../strings/typography.ts';
import { Button } from '../ui/Button.tsx';
import { Checkbox } from '../ui/Checkbox.tsx';
import { Field } from '../ui/Field.tsx';
import { Icon, iconNames } from '../ui/icons/Icon.tsx';
import { Slider } from '../ui/Slider.tsx';
import { Stamp } from '../ui/Stamp.tsx';
import styles from './Styleguide.module.css';

const swatches = [
  'paper',
  'paper-shade',
  'paper-deep',
  'manila',
  'cork',
  'ink',
  'ink-soft',
  'ink-faint',
  'editorial-red',
  'copy-blue',
  'ochre',
  'player-0',
  'player-1',
  'player-2',
  'player-3',
];

const typeScale = ['masthead', '3xl', '2xl', 'xl', 'lg', 'md', 'sm', 'xs'];

export function Styleguide() {
  const [slamKey, setSlamKey] = useState(0);
  const [checked, setChecked] = useState(true);
  const [volume, setVolume] = useState(0.7);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>{pl.styleguide.title}</h1>
        <p className="label">Redakcja na Ostatnią Chwilę · {formatDate(new Date())}</p>
      </header>

      <section className={styles.section}>
        <h2>Kolory</h2>
        <div className={styles.swatches}>
          {swatches.map((name) => (
            <figure key={name} className={styles.swatch}>
              <span style={{ background: `var(--${name})` }} />
              <figcaption className="typed">--{name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Pismo</h2>
        {typeScale.map((size) => (
          <p
            key={size}
            style={{ fontSize: `var(--text-${size})`, lineHeight: 'var(--leading-snug)' }}
          >
            {size} — Zażółć gęślą jaźń
          </p>
        ))}
        <p className="label">Etykieta grotesk — Kod pokoju</p>
        <p className="typed">Maszynopis: Zdjęcie znalezione w sieci w 2019 r.</p>
        <p>
          {typeset('Cytat "w kontekście" - z sierotkami i datą')} · {formatNumber(12345)}
        </p>
      </section>

      <section className={styles.section}>
        <h2>Ikony</h2>
        <div className={styles.icons}>
          {iconNames.map((name) => (
            <figure key={name} className={styles.icon}>
              <Icon name={name} size={36} />
              <figcaption className="typed">{name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Pieczątki</h2>
        <div className={styles.stamps} key={slamKey}>
          <Stamp text="Fałsz" subtext="Kartoteka źródeł" tone="red" seed={11} slam />
          <Stamp
            text="Potwierdzone"
            subtext="6.10.2026"
            tone="blue"
            shape="double"
            seed={23}
            slam
          />
          <Stamp text="Kontekst" tone="ochre" shape="circle" seed={37} slam size={130} />
          <Stamp text="Archiwum" subtext="znalezione w 2019 r." tone="ink" seed={41} slam />
        </div>
        <Button
          onClick={() => {
            setSlamKey((k) => k + 1);
            emitCue('stamp.applied');
          }}
        >
          Przybij jeszcze raz
        </Button>
      </section>

      <section className={styles.section}>
        <h2>Przyciski i pola</h2>
        <div className={styles.row}>
          <Button variant="stamp">Do składu!</Button>
          <Button>Dołącz</Button>
          <Button variant="tab">Archiwum</Button>
          <Button variant="quiet" back>
            Wyjdź
          </Button>
          <Button icon={<Icon name="settings" label="Ustawienia" />} />
        </div>
        <div className={styles.fields}>
          <Field label="Twój podpis" placeholder="np. Zośka" hint="Od 1 do 16 znaków." />
          <Field label="Kod pokoju" large defaultValue="KRWN" />
          <Field label="Z błędem" defaultValue="x" error="Nie ma redakcji z takim kodem." />
          <Checkbox label="Mniej ruchu" checked={checked} onChange={setChecked} />
          <Slider label="Efekty" value={volume} onChange={setVolume} />
        </div>
      </section>
    </main>
  );
}
