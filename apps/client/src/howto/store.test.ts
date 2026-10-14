import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { DEFAULT_PUBLIC_CONFIG } from '@redakcja/shared';
import { usePublicConfig } from '../store/public-config.ts';
import {
  canPractice,
  HOW_TO_TABS,
  howToTabs,
  nextHowToTab,
  offeredTab,
  useHowTo,
} from './store.ts';

describe('how-to tabs', () => {
  it('has the three tabs in order', () => {
    expect(HOW_TO_TABS).toEqual(['intro', 'stations', 'controls']);
  });

  it('steps forward and back, wrapping around', () => {
    expect(nextHowToTab('intro')).toBe('stations');
    expect(nextHowToTab('stations', 1)).toBe('controls');
    expect(nextHowToTab('controls', 1)).toBe('intro');
    expect(nextHowToTab('intro', -1)).toBe('controls');
    expect(nextHowToTab('stations', -1)).toBe('intro');
  });

  it('drops Wprowadzenie when the intro flag is off (S7-102)', () => {
    expect(howToTabs(true)).toEqual(['intro', 'stations', 'controls']);
    expect(howToTabs(false)).toEqual(['stations', 'controls']);
    expect(offeredTab('intro', howToTabs(false))).toBe('stations');
    expect(offeredTab('controls', howToTabs(false))).toBe('controls');
    expect(nextHowToTab('controls', 1, howToTabs(false))).toBe('stations');
    expect(nextHowToTab('stations', -1, howToTabs(false))).toBe('controls');
  });
});

describe('how-to store with the intro flag off (S7-102)', () => {
  beforeEach(() => {
    usePublicConfig.setState({
      config: {
        ...DEFAULT_PUBLIC_CONFIG,
        features: { ...DEFAULT_PUBLIC_CONFIG.features, intro: false },
      },
    });
    useHowTo.getState().hide();
  });

  afterEach(() => {
    usePublicConfig.setState({ config: DEFAULT_PUBLIC_CONFIG });
  });

  it('opens on the stations instead, and never autoplays', () => {
    useHowTo.getState().show('intro', { autoplay: true });
    expect(useHowTo.getState()).toMatchObject({ open: true, tab: 'stations', autoplay: false });
    useHowTo.getState().setTab('intro');
    expect(useHowTo.getState().tab).toBe('stations');
    useHowTo.getState().setTab('controls');
    expect(useHowTo.getState().tab).toBe('controls');
  });
});

describe('how-to store', () => {
  beforeEach(() => {
    useHowTo.getState().hide();
  });

  it('opens on the intro by default, practice allowed', () => {
    useHowTo.getState().show();
    expect(useHowTo.getState()).toMatchObject({
      open: true,
      tab: 'intro',
      station: null,
      practiceAllowed: true,
      autoplay: false,
    });
  });

  it('opens on a station with practice off (in a match)', () => {
    useHowTo.getState().show('stations', { station: 'archive', practiceAllowed: false });
    expect(useHowTo.getState()).toMatchObject({
      open: true,
      tab: 'stations',
      station: 'archive',
      practiceAllowed: false,
    });
  });

  it('a new show resets what the previous one asked for', () => {
    useHowTo.getState().show('stations', { station: 'phone', practiceAllowed: false });
    useHowTo.getState().hide();
    useHowTo.getState().show('controls');
    expect(useHowTo.getState()).toMatchObject({
      tab: 'controls',
      station: null,
      practiceAllowed: true,
    });
  });

  it('switching tabs leaves the station card and the autoplay', () => {
    useHowTo.getState().show('intro', { autoplay: true });
    useHowTo.getState().setStation('metadata');
    useHowTo.getState().setTab('stations');
    expect(useHowTo.getState()).toMatchObject({ tab: 'stations', station: null, autoplay: false });
  });

  it('hides', () => {
    useHowTo.getState().show('controls');
    useHowTo.getState().hide();
    expect(useHowTo.getState().open).toBe(false);
  });

  it('starts practice from a station card and leaves it with the card', () => {
    useHowTo.getState().show('stations', { station: 'archive' });
    useHowTo.getState().setPractice('playing');
    expect(useHowTo.getState().practice).toBe('playing');
    useHowTo.getState().setPractice('result');
    expect(useHowTo.getState().practice).toBe('result');
    useHowTo.getState().setStation(null);
    expect(useHowTo.getState()).toMatchObject({ station: null, practice: 'off' });
  });

  it('never starts practice in a match or without a card', () => {
    useHowTo.getState().show('stations', { station: 'phone', practiceAllowed: false });
    useHowTo.getState().setPractice('playing');
    expect(useHowTo.getState().practice).toBe('off');
    useHowTo.getState().show('stations');
    useHowTo.getState().setPractice('playing');
    expect(useHowTo.getState().practice).toBe('off');
  });

  it('a tab switch, a new show or hiding ends the practice round', () => {
    useHowTo.getState().show('stations', { station: 'metadata' });
    useHowTo.getState().setPractice('playing');
    useHowTo.getState().setTab('controls');
    expect(useHowTo.getState().practice).toBe('off');
    useHowTo.getState().show('stations', { station: 'metadata' });
    useHowTo.getState().setPractice('playing');
    useHowTo.getState().hide();
    expect(useHowTo.getState().practice).toBe('off');
    useHowTo.getState().show('stations', { station: 'metadata' });
    expect(useHowTo.getState().practice).toBe('off');
  });
});

describe('canPractice', () => {
  it('needs the stations tab, a card and practice allowed', () => {
    expect(canPractice({ tab: 'stations', station: 'archive', practiceAllowed: true })).toBe(true);
    expect(canPractice({ tab: 'stations', station: 'archive', practiceAllowed: false })).toBe(
      false,
    );
    expect(canPractice({ tab: 'stations', station: null, practiceAllowed: true })).toBe(false);
    expect(canPractice({ tab: 'intro', station: 'archive', practiceAllowed: true })).toBe(false);
  });
});
