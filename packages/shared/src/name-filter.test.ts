import { describe, expect, it } from 'bun:test';
import { isAcceptableName, maskName, NAME_MASK_CHAR } from './name-filter.ts';

describe('isAcceptableName', () => {
  it('accepts ordinary room names and nicknames', () => {
    for (const name of [
      '3B piątek',
      'Klasa 2A',
      'Kurier Warszawski',
      'Moje bajki',
      'Hej Bob',
      'Pizza i fakty',
      'Sukces 1C',
      'Łukasz Żółć',
      'Redakcja nr 7',
      'participants',
    ]) {
      expect({ name, ok: isAcceptableName(name) }).toEqual({ name, ok: true });
    }
  });

  it('rejects a blocked word written plainly, in capitals or inside a longer word', () => {
    expect(isAcceptableName('kurwa')).toBe(false);
    expect(isAcceptableName('KURWA mać')).toBe(false);
    expect(isAcceptableName('zjebani 3B')).toBe(false);
  });

  it('rejects a blocked word written with diacritics', () => {
    expect(isAcceptableName('kürwą')).toBe(false);
    expect(isAcceptableName('Chój')).toBe(false);
    expect(isAcceptableName('pierdolę')).toBe(false);
  });

  it('rejects a blocked word written with digits or symbols', () => {
    expect(isAcceptableName('kurw4')).toBe(false);
    expect(isAcceptableName('p1zd4')).toBe(false);
    expect(isAcceptableName('$uk4')).toBe(false);
    expect(isAcceptableName('d3b1l')).toBe(false);
  });

  it('rejects repeated letters, look-alike spellings and split letters', () => {
    expect(isAcceptableName('kuuurwaaa')).toBe(false);
    expect(isAcceptableName('kurva')).toBe(false);
    expect(isAcceptableName('huj')).toBe(false);
    expect(isAcceptableName('k.u.r.w.a')).toBe(false);
    expect(isAcceptableName('k u r w a')).toBe(false);
    expect(isAcceptableName('k u u r w a')).toBe(false);
    expect(isAcceptableName('c h u j')).toBe(false);
  });

  it('blocks whole-word entries only as whole words', () => {
    expect(isAcceptableName('dupa')).toBe(false);
    expect(isAcceptableName('dupek')).toBe(true);
    expect(isAcceptableName('suka')).toBe(false);
    expect(isAcceptableName('sukienka')).toBe(true);
  });
});

describe('maskName', () => {
  it('keeps an acceptable name and masks a blocked one to the same length', () => {
    expect(maskName('Ola')).toBe('Ola');
    expect(maskName('kurw4 7')).toBe(NAME_MASK_CHAR.repeat(7));
    expect(NAME_MASK_CHAR).toBe('*');
  });
});
