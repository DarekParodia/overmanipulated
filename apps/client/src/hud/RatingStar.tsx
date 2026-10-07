// One big rating star on the results panel. Earned stars are yellow and pop in one after
// another; missing ones are an empty grey outline (the panel also says how many were earned).
import styles from './ResultsPlate.module.css';

const STAR =
  'M50 8 L62.4 34.6 L91.6 37.9 L69.8 57.7 L75.9 86.5 L50 71.8 L24.1 86.5 L30.2 57.7 L8.4 37.9 L37.6 34.6 Z';

export function RatingStar({ earned, delayMs }: { earned: boolean; delayMs: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${styles.star} ${earned ? styles.starEarned : styles.starMissing}`}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden
    >
      {/* Hard drop shadow: the same star nudged down, no blur. */}
      <path d={STAR} transform="translate(0 5)" className={styles.starShadow} />
      <path d={STAR} className={styles.starBody} strokeWidth="7" strokeLinejoin="round" />
    </svg>
  );
}
