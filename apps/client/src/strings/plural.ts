// Polish plural forms for counted nouns: „1 teczka”, „2 teczki”, „5 teczek”, „22 teczki”.

/**
 * Picks the Polish form of a noun for `n`: `one` for exactly 1, `few` when the last digit is
 * 2–4 (but not 12–14), `many` otherwise (0, 5–21, 25–31, …). Returns the word only.
 */
export function pluralPl(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n);
  if (abs === 1) {
    return one;
  }
  const lastDigit = abs % 10;
  const lastTwo = abs % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 12 || lastTwo > 14)) {
    return few;
  }
  return many;
}
