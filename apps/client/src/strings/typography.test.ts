import { describe, expect, it } from 'bun:test';
import { bindOrphans, formatDate, formatNumber, polishQuotes, typeset } from './typography.ts';

describe('Polish typography', () => {
  it('binds one-letter words to the next word', () => {
    expect(bindOrphans('Burza w mieście i zdjęcie z 2019 r.')).toBe(
      'Burza w mieście i zdjęcie z 2019 r.',
    );
    expect(bindOrphans('W redakcji')).toBe('W redakcji');
  });

  it('does not touch letters inside words', () => {
    expect(bindOrphans('Kawa stygnie')).toBe('Kawa stygnie');
  });

  it('uses Polish quotation marks', () => {
    expect(polishQuotes('Post: "To już wszędzie jest!"')).toBe('Post: „To już wszędzie jest!”');
  });

  it('typesets dashes', () => {
    expect(typeset('Szybko - ale rzetelnie')).toBe('Szybko – ale rzetelnie');
  });

  it('formats dates in Polish', () => {
    expect(formatDate(new Date(2026, 9, 6))).toBe('6 października 2026');
  });

  it('groups thousands with a narrow non-breaking space', () => {
    expect(formatNumber(950)).toBe('950');
    expect(formatNumber(12345)).toBe('12 345');
    expect(formatNumber(-1500)).toBe('-1 500');
  });
});
