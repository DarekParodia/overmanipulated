// Polish typesetting helpers (agents/design-rules.md §4).

const NBSP = ' ';
const NARROW_NBSP = ' ';

/**
 * Binds one-letter words (w, z, i, a, o, u — any case) to the following word with a
 * non-breaking space so they never end a line ("sierotki").
 */
export function bindOrphans(text: string): string {
  return text.replace(/(^|[\s(„])([aiouwzAIOUWZ]) /g, `$1$2${NBSP}`);
}

/** Replaces straight double quotes with Polish „…” and straight apostrophes with ’. */
export function polishQuotes(text: string): string {
  let open = true;
  return text
    .replace(/"/g, () => {
      const mark = open ? '„' : '”';
      open = !open;
      return mark;
    })
    .replace(/'/g, '’');
}

/** Spaced en dash instead of a hyphen used as a dash. */
export function dashes(text: string): string {
  return text.replace(/ - /g, ' – ');
}

/** Applies all typesetting rules; use for any longer player-facing text. */
export function typeset(text: string): string {
  return bindOrphans(dashes(polishQuotes(text)));
}

const dateFormat = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const weekdayFormat = new Intl.DateTimeFormat('pl-PL', { weekday: 'long' });
const timeFormat = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' });

/** "6 października 2026" */
export function formatDate(date: Date): string {
  return dateFormat.format(date);
}

/** "wtorek" */
export function formatWeekday(date: Date): string {
  return weekdayFormat.format(date);
}

/** "14:05" */
export function formatTime(date: Date): string {
  return timeFormat.format(date);
}

/** Thousands grouped with a narrow non-breaking space from 1000 up: "12 345". */
export function formatNumber(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  if (digits.length < 4) {
    return sign + digits;
  }
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NARROW_NBSP);
}
