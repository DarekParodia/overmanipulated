// Each technique card has one icon from our set; a card the map does not know yet falls back to
// the icon of the first station that helps against it, so new content never breaks the grid.
import type { StationKind } from '@redakcja/shared';
import type { IconName } from '../ui/icons/Icon.tsx';

const CARD_ICONS: Readonly<Record<string, IconName>> = {
  'stare-zdjecie-nowy-podpis': 'photo',
  'podszywanie-sie-pod-instytucje': 'sourceRegistry',
  'satyra-brana-na-powaznie': 'article',
  'anonimowy-informator': 'phone',
  'plotka-bez-zrodla': 'post',
  'wyrwane-z-kontekstu': 'quote',
  'zmyslony-cytat': 'question',
  'falszywy-sondaz': 'statistic',
  'screenshot-bez-linku': 'fullscreen',
  'argument-z-tlumu': 'hourglass',
  'zmanipulowana-statystyka': 'dataLibrary',
  'falszywy-ekspert': 'user',
  'korelacja-jako-przyczyna': 'arrow',
  'tania-podrobka': 'recording',
  'obraz-wygenerowany-ai': 'aiScanner',
  'deepfake-audio': 'sound',
  'siec-botow': 'bot',
  astroturfing: 'globe',
  none: 'check',
};

export function cardIcon(technique: { id: string; stations: readonly StationKind[] }): IconName {
  return CARD_ICONS[technique.id] ?? technique.stations[0] ?? 'book';
}
