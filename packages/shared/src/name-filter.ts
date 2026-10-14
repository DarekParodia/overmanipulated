// Name filter (S7-78): a small Polish blocklist for room names (the server answers
// `invalidName`, S7-82) and for host nicknames shown in the room browser (`maskName`, S7-83).
// It is a courtesy filter for a classroom, not a moderation system: it catches the common
// vulgarities and slurs, also written with diacritics, digits ("leetspeak"), repeated letters
// or letters split by dots, dashes or spaces, and keeps false positives on ordinary words rare.
import { foldSearch } from './rooms.ts';

/**
 * Blocked when they occur anywhere inside a word. Kept in plain lower case; they go through the
 * same folding as the checked text, so `l`/`1`, `v`/`w` and `ch`/`h` variants need no entries.
 */
const BLOCKED_STEMS: readonly string[] = [
  'kurw',
  'huj',
  'jeb',
  'pierdol',
  'pierdal',
  'pizd',
  'kutas',
  'dziwk',
  'cwel',
  'pedof',
  'hitler',
  'fuck',
];

/** Blocked only as a whole word, because as a part of a word they hit ordinary words. */
const BLOCKED_WORDS: readonly string[] = [
  'cipa',
  'cipy',
  'suka',
  'suki',
  'dupa',
  'ciota',
  'debil',
  'hwdp',
  'nazi',
  'shit',
];

/** Look-alike characters folded to one letter after `foldSearch`. */
const LOOKALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  l: 'i',
  '3': 'e',
  '4': 'a',
  '@': 'a',
  '5': 's',
  $: 's',
  '7': 't',
  '+': 't',
  '8': 'b',
  '9': 'g',
  v: 'w',
};

/** What `maskName` writes in place of every character of a blocked name. */
export const NAME_MASK_CHAR = '*';

/**
 * The comparable form of one word: search-folded (`ó` first becomes `u`, which sounds the same),
 * look-alikes replaced, `ch` → `h`, everything but letters dropped and letter runs collapsed.
 */
function foldWord(word: string): string {
  const folded = [...foldSearch(word.replace(/[óÓ]/g, 'u'))]
    .map((char) => LOOKALIKES[char] ?? char)
    .join('');
  return folded
    .replace(/ch/g, 'h')
    .replace(/[^a-z]/g, '')
    .replace(/([a-z])\1+/g, '$1');
}

const STEMS = BLOCKED_STEMS.map(foldWord);
const WORDS = new Set(BLOCKED_WORDS.map(foldWord));

/**
 * The folded words of a text; runs of single letters ("k u r w a", "k u u r w a") are joined
 * into one and folded again, so a split doubled letter collapses too.
 */
function wordsOf(text: string): string[] {
  const words: string[] = [];
  let letters = '';
  for (const raw of text.split(/\s+/)) {
    const word = foldWord(raw);
    if (word.length === 1) {
      letters += word;
      continue;
    }
    if (letters.length > 0) {
      words.push(foldWord(letters));
      letters = '';
    }
    if (word.length > 0) {
      words.push(word);
    }
  }
  if (letters.length > 0) {
    words.push(foldWord(letters));
  }
  return words;
}

/** False when the text contains a blocked word in any of the folded spellings. */
export function isAcceptableName(text: string): boolean {
  return wordsOf(text).every(
    (word) => !WORDS.has(word) && !STEMS.some((stem) => word.includes(stem)),
  );
}

/** The name unchanged when acceptable, else `NAME_MASK_CHAR` repeated to the same length. */
export function maskName(name: string): string {
  return isAcceptableName(name) ? name : NAME_MASK_CHAR.repeat(name.length);
}
