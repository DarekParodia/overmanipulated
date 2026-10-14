// Encyclopedia cards for the Stage 7 stations (S7-65): the cards point players to Stenogram,
// Metadane, Mapa and Inne media, and an l6 story's technique id collects into an existing card.
import { describe, expect, it } from 'bun:test';
import { STATION_KINDS, type StationKind } from '@redakcja/shared';
import { TECHNIQUES } from './index.ts';

function card(id: string) {
  const found = TECHNIQUES.find((technique) => technique.id === id);
  if (!found) {
    throw new Error(`no technique card "${id}"`);
  }
  return found;
}

describe('technique cards for the new stations (S7-65)', () => {
  it('lists the new stations on the cards they help against', () => {
    expect(
      Object.fromEntries(
        [
          'wyrwane-z-kontekstu',
          'zmyslony-cytat',
          'tania-podrobka',
          'obraz-wygenerowany-ai',
          'deepfake-audio',
          'stare-zdjecie-nowy-podpis',
          'plotka-bez-zrodla',
          'podszywanie-sie-pod-instytucje',
          'siec-botow',
          'satyra-brana-na-powaznie',
          'none',
        ].map((id) => [id, card(id).stations]),
      ),
    ).toEqual({
      'wyrwane-z-kontekstu': ['transcript', 'archive', 'phone'],
      'zmyslony-cytat': ['transcript', 'archive', 'sourceRegistry', 'phone'],
      'tania-podrobka': ['archive', 'transcript', 'aiScanner', 'imageSearch'],
      'obraz-wygenerowany-ai': ['aiScanner', 'metadata', 'imageSearch', 'sourceRegistry'],
      'deepfake-audio': ['aiScanner', 'phone', 'metadata', 'sourceRegistry'],
      'stare-zdjecie-nowy-podpis': ['imageSearch', 'geolocation', 'metadata', 'archive'],
      'plotka-bez-zrodla': ['crossCheck', 'sourceRegistry', 'archive', 'phone'],
      'podszywanie-sie-pod-instytucje': ['sourceRegistry', 'phone', 'crossCheck'],
      'siec-botow': ['sourceRegistry', 'crossCheck', 'aiScanner', 'dataLibrary'],
      'satyra-brana-na-powaznie': ['sourceRegistry', 'crossCheck', 'archive'],
      none: ['crossCheck', 'sourceRegistry', 'phone', 'archive'],
    });
  });

  it('names every station of the game on at least one card', () => {
    const named = new Set<StationKind>(TECHNIQUES.flatMap((technique) => technique.stations));
    expect(STATION_KINDS.filter((kind) => !named.has(kind))).toEqual([]);
  });

  it('mentions each listed new station in the card’s detect text', () => {
    const names: Partial<Record<StationKind, string>> = {
      transcript: 'Stenogram',
      metadata: 'Metadane',
      geolocation: 'Mapa',
      crossCheck: 'Inne media',
    };
    for (const technique of TECHNIQUES) {
      for (const station of technique.stations) {
        const name = names[station];
        if (name !== undefined) {
          expect({ id: technique.id, mentions: technique.detect.includes(name) }).toEqual({
            id: technique.id,
            mentions: true,
          });
        }
      }
    }
  });

  it('collects zdjecie-z-innego-miejsca into the old-photo card', () => {
    expect(card('stare-zdjecie-nowy-podpis').aliases).toEqual([
      'zdjecie-w-zlym-czasie',
      'zdjecie-z-innego-miejsca',
    ]);
  });
});
