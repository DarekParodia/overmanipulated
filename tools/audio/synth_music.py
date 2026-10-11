#!/usr/bin/env python3
"""Synthesises the game music: a menu loop and, per level (1-6 and endless), a calm + pressure pair.

Everything is generated here from oscillators and filtered noise (no downloaded samples), so the
music is self-made and free of licensing questions (agents/game-feel.md). The two layers of a level
share tempo, key and length so the client can cross-fade them in sync; every level has its own key,
tempo and instrumentation so levels feel different:

  menu  D minor  104 BPM  Rhodes, upright bass, brushes                       (noir jazz)
  l1    D minor  104 BPM  walking bass, muted piano, ride | typewriter, snare (newsroom noir)
  l2    A major  112 BPM  marimba arpeggios, pizzicato bass, shaker | wood-block clock, claps
  l3    E minor  120 BPM  plucked synth arpeggio, sub bass, 4-on-the-floor | 16th pulse, risers
  l4    G dorian  98 BPM  clavinet comping, slap bass, funk drums, swung | wah riff, brass stabs
  l5    C minor  126 BPM  detuned string pad, heartbeat kick, eerie bells | glitch ticks, dissonant stabs
  l6    F# minor 132 BPM  taiko toms, staccato string ostinato, drone | brass stabs, snare rolls
  endless Bb minor 116 BPM  pulse bass, bell arpeggio, pad | dense 16ths, snare build

Loops are rendered circularly (note tails past the loop end wrap to the start), so loop points
are seamless. Files are mono, 24 kHz: webm/opus and mp3 fallback. A manifest with the loop length
of every track is written to apps/client/src/fx/audio/music-manifest.json.

Usage: python3 tools/audio/synth_music.py   (requires numpy and ffmpeg)
Outputs: apps/client/public/assets/audio/music/{menu,l1..l6,endless}[-pressure].{webm,mp3}
Prints peak / RMS / crest / energy per frequency band per track as a sanity check.
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

RATE = 44100
BARS = 16
ENCODE_RATE = 24000
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "apps/client/public/assets/audio/music"
OUT_MANIFEST = ROOT / "apps/client/src/fx/audio/music-manifest.json"
rng = np.random.default_rng(2604)

# Per-song state, set by configure().
BPM = 104
BEAT = 60 / BPM
LOOP_S = BARS * 4 * BEAT
LOOP_N = int(round(LOOP_S * RATE))
SWING = 0.62  # position of the off-beat 8th inside a beat (0.5 = straight)
CHORDS = []


def configure(bpm, swing, chords):
    global BPM, BEAT, LOOP_S, LOOP_N, SWING, CHORDS
    BPM, SWING, CHORDS = bpm, swing, chords
    BEAT = 60 / bpm
    LOOP_S = BARS * 4 * BEAT
    LOOP_N = int(round(LOOP_S * RATE))


# Two 8-bar halves: i - IV7 - bVII - V7alt / i - bVI7 - ii-half-dim - V7 (D minor).
# Each chord: (bass root midi, voicing midi notes).
L1_CHORDS = [
    (38, [53, 57, 60, 64]),  # Dm9    D2 | F A C E
    (43, [53, 59, 64, 69]),  # G13    G2 | F B E A
    (36, [52, 55, 59, 62]),  # Cmaj9  C2 | E G B D
    (45, [55, 58, 61, 65]),  # A7alt  A2 | G Bb C# F
    (38, [53, 57, 60, 64]),  # Dm9
    (46, [56, 60, 62, 67]),  # Bb13   Bb2| Ab C D G
    (40, [55, 58, 62, 64]),  # Em7b5  E2 | G Bb D (E)
    (45, [55, 61, 64, 67]),  # A7     A2 | G C# E G
]


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bar_chord(bar):
    return CHORDS[bar % len(CHORDS)]


def beat_time(bar, beat):
    return (bar * 4 + beat) * BEAT


def swung(bar, eighth):
    """Start time of the given 8th note (0-7) in a bar, with swing."""
    beat, off = divmod(eighth, 2)
    return beat_time(bar, beat + (SWING if off else 0))


def place(track, sound, start_s, gain=1.0):
    """Mixes `sound` into the circular `track` starting at `start_s` (wraps past the end)."""
    start = int(round(start_s * RATE)) % LOOP_N
    n = len(sound)
    end = start + n
    if end <= LOOP_N:
        track[start:end] += gain * sound
    else:
        first = LOOP_N - start
        track[start:] += gain * sound[:first]
        rest = sound[first:]
        while len(rest):
            chunk = rest[:LOOP_N]
            track[: len(chunk)] += gain * chunk
            rest = rest[LOOP_N:]


def tt(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(seconds, attack, decay, release=0.01):
    x = tt(seconds)
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    e = a * np.exp(-x / decay)
    r = int(RATE * release)
    if r and len(e) > r:
        e[-r:] *= np.linspace(1, 0, r)
    return e


def band(signal, low=0.0, high=None):
    """Zero-phase band filter via FFT with soft (one-octave) skirts."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    mask = np.ones_like(f)
    if low > 0:
        mask *= np.clip(np.log2(np.maximum(f, 1e-3) / low) + 1, 0, 1)
    if high is not None:
        mask *= np.clip(1 - np.log2(np.maximum(f, 1e-3) / high), 0, 1)
    return np.fft.irfft(spec * mask, len(signal))


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


# --- Instruments ---------------------------------------------------------------------------


def rhodes(midi, seconds, vel=1.0):
    """Electric-piano tone: sine with a bell-ish 2nd partial and a soft tine attack."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x + 0.6 * np.sin(2 * np.pi * f * x) * np.exp(-x / 0.25))
    s += 0.25 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.4)
    s += 0.08 * np.sin(2 * np.pi * 7 * f * x) * np.exp(-x / 0.03)
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.5 * x)
    return vel * s * trem * env(seconds, 0.004, seconds * 0.55, 0.08)


def piano_stab(midi, seconds, vel=1.0):
    """Muted, short piano comp note."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * 2 * f * x) + 0.15 * np.sin(2 * np.pi * 3 * f * x)
    return vel * s * env(seconds, 0.003, 0.12, 0.03)


def upright(midi, seconds, vel=1.0):
    """Upright bass pluck: low sine with a soft saturated attack."""
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) + 0.3 * np.sin(2 * np.pi * 2 * f * x) * np.exp(-x / 0.08)
    s = np.tanh(1.6 * s) / np.tanh(1.6)
    thump = band(noise(seconds), 80, 500) * np.exp(-x / 0.012) * 0.4
    return vel * (s * env(seconds, 0.006, 0.35, 0.04) + thump)


def kick(vel=1.0):
    x = tt(0.3)
    freq = 48 + 70 * np.exp(-x / 0.03)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    return vel * np.sin(phase) * env(0.3, 0.001, 0.12)


def ride(vel=1.0):
    """Ride cymbal: metallic partials plus high noise, long-ish decay."""
    x = tt(0.9)
    metal = sum(np.sin(2 * np.pi * f * x) for f in (3170, 4410, 5590, 6810, 8230)) / 5
    hiss = band(noise(0.9), 6000, 14000)
    return vel * (0.5 * metal + 0.6 * hiss) * env(0.9, 0.001, 0.28, 0.05)


def hihat(vel=1.0):
    return vel * band(noise(0.07), 7000, 15000) * env(0.07, 0.0005, 0.015)


def snare(vel=1.0):
    x = tt(0.25)
    body = np.sin(2 * np.pi * 190 * x) * np.exp(-x / 0.04)
    rattle = band(noise(0.25), 1500, 9000) * np.exp(-x / 0.07)
    return vel * (0.6 * body + rattle) * env(0.25, 0.001, 0.2)


def brush(vel=1.0):
    """Brushed snare swish: slow-attack band-passed noise."""
    s = band(noise(0.35), 2000, 8000)
    return vel * s * env(0.35, 0.06, 0.12, 0.05)


def typewriter(vel=1.0):
    """Typewriter key: sharp click with a short wooden knock."""
    x = tt(0.06)
    click = band(noise(0.06), 2500, 12000) * np.exp(-x / 0.006)
    knock = np.sin(2 * np.pi * 380 * x) * np.exp(-x / 0.01)
    return vel * (click + 0.5 * knock)


def carriage_bell(vel=1.0):
    x = tt(0.8)
    s = sum(a * np.sin(2 * np.pi * 2093 * r * x) for r, a in ((1, 1.0), (2.76, 0.3), (5.4, 0.1)))
    return vel * s * env(0.8, 0.001, 0.22)


# --- Tracks --------------------------------------------------------------------------------


def menu_track():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        # Rhodes: chord on 1 (rolled), a lighter re-strike on the "and" of 2.
        for i, m in enumerate(voicing):
            place(track, rhodes(m, BEAT * 3.2, 0.5), beat_time(bar, 0) + i * 0.018)
            place(track, rhodes(m, BEAT * 1.6, 0.28), swung(bar, 3) + i * 0.012)
        # Soft bass on 1 and 3 (root, then fifth).
        place(track, upright(root, BEAT * 1.8, 0.75), beat_time(bar, 0))
        place(track, upright(root + 7, BEAT * 1.8, 0.6), beat_time(bar, 2))
        # Brushes: swish on 2 and 4, light tap on the swung offbeats.
        for beat in (1, 3):
            place(track, brush(0.3), beat_time(bar, beat) - 0.04)
        for eighth in (1, 3, 5, 7):
            place(track, hihat(0.08), swung(bar, eighth))
    return track


def walking_line(bar):
    """Four quarter notes: root, chord tone, approach, chromatic lead into the next root."""
    root, _ = bar_chord(bar)
    nxt, _ = bar_chord(bar + 1)
    third = root + (3 if bar % 8 in (0, 4, 6) else 4)
    fifth = root + 7
    lead = nxt + (1 if nxt <= root else -1)
    return [root, third if bar % 2 else fifth, fifth if bar % 2 else third, lead]


def calm_track():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        _, voicing = bar_chord(bar)
        for beat, m in enumerate(walking_line(bar)):
            place(track, upright(m, BEAT * 0.95, 0.5), beat_time(bar, beat))
        # Piano comping: short stabs on the "and" of 1 and on 3 (or 4 every other bar).
        hits = (1, 4) if bar % 2 == 0 else (1, 6)
        for eighth in hits:
            for m in voicing:
                place(track, piano_stab(m, 0.35, 0.3), swung(bar, eighth))
        # Ride: ding, ding-ga-ding pattern.
        for eighth in (0, 2, 3, 4, 6, 7):
            place(track, ride(0.32 if eighth % 2 == 0 else 0.2), swung(bar, eighth))
        # Feathered kick on every beat, hi-hat foot on 2 and 4.
        for beat in range(4):
            place(track, kick(0.14), beat_time(bar, beat))
        for beat in (1, 3):
            place(track, hihat(0.25), beat_time(bar, beat))
    return track


def pressure_track():
    track = np.zeros(LOOP_N)
    sixteenth = BEAT / 4
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        # Typewriter: 16ths with accents and a few gaps; carriage bell at the end of 4-bar lines.
        for i in range(16):
            if i in (7, 15) and bar % 2:
                continue
            accent = 0.5 if i % 4 == 0 else 0.3 if i % 2 == 0 else 0.22
            jitter = rng.uniform(-0.004, 0.004)
            place(track, typewriter(accent), beat_time(bar, 0) + i * sixteenth + jitter)
        if bar % 4 == 3:
            place(track, carriage_bell(0.28), beat_time(bar, 3) + 2 * sixteenth)
        # Tight backbeat snare and closed hats on straight 8ths.
        for beat in (1, 3):
            place(track, snare(0.5), beat_time(bar, beat))
        for eighth in range(8):
            place(track, hihat(0.3 if eighth % 2 else 0.18), beat_time(bar, eighth / 2))
        # Kick: driving 1, "and" of 2, 3.
        for beat in (0, 1.5, 2):
            place(track, kick(0.28), beat_time(bar, beat))
        # Octave bass pulse on 8ths.
        for eighth in range(8):
            m = root + (12 if eighth % 2 else 0)
            place(track, upright(m, BEAT * 0.45, 0.25), beat_time(bar, eighth / 2))
        # Staccato stabs on the "and" of 4 (anticipation).
        for m in voicing:
            place(track, piano_stab(m + 12, 0.2, 0.13), beat_time(bar, 3.5))
    return track


# --- More instruments (levels 2-6 and endless) ---------------------------------------------------


def additive(f, seconds, amps, taus):
    """Sum of harmonics, each with its own exponential decay (bright start, mellow tail)."""
    x = tt(seconds)
    s = np.zeros_like(x)
    for k, (a, tau) in enumerate(zip(amps, taus), 1):
        if f * k > 9000:
            break
        s += a * np.sin(2 * np.pi * f * k * x) * np.exp(-x / tau)
    return s


def pluck_synth(midi, seconds, vel=1.0, bright=1.0, tau=0.25):
    """Plucked synth: saw-like harmonics where the high ones die first."""
    f = midi_hz(midi)
    amps = [1 / k for k in range(1, 11)]
    taus = [tau / (1 + 0.55 * bright * (k - 1)) for k in range(1, 11)]
    return vel * additive(f, seconds, amps, taus) * env(seconds, 0.002, 10, 0.02)


def saw_bass(midi, seconds, vel=1.0, tau=None):
    f = midi_hz(midi)
    tau = tau or seconds * 0.8
    s = additive(f, seconds, [1 / k for k in range(1, 8)], [tau] * 7)
    s = np.tanh(1.3 * s) / np.tanh(1.3)
    return vel * s * env(seconds, 0.004, 10, 0.03)


def sub_bass(midi, seconds, vel=1.0):
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) + 0.2 * np.sin(2 * np.pi * 2 * f * x)
    return vel * s * env(seconds, 0.01, seconds * 0.9, 0.05)


def slap_bass(midi, seconds, vel=1.0):
    """Funk bass: round tone with a bright, quick 'pop' on the attack."""
    f = midi_hz(midi)
    amps = [1.0, 0.5, 0.45, 0.3, 0.25, 0.2, 0.15, 0.1]
    taus = [0.22, 0.12, 0.07, 0.05, 0.035, 0.03, 0.025, 0.02]
    s = additive(f, seconds, amps, taus)
    s = np.tanh(1.8 * s) / np.tanh(1.8)
    return vel * s * env(seconds, 0.002, 10, 0.03)


def marimba(midi, seconds, vel=1.0):
    f = midi_hz(midi)
    x = tt(seconds)
    s = np.sin(2 * np.pi * f * x) * np.exp(-x / 0.3)
    s += 0.45 * np.sin(2 * np.pi * 3.99 * f * x) * np.exp(-x / 0.05)
    s += 0.15 * np.sin(2 * np.pi * 9.9 * f * x) * np.exp(-x / 0.02)
    return vel * s * env(seconds, 0.001, 10, 0.02)


def clav(midi, seconds, vel=1.0):
    """Clavinet-ish: odd-harmonic pluck, very short."""
    f = midi_hz(midi)
    amps = [1, 0.1, 0.6, 0.1, 0.4, 0.1, 0.25]
    taus = [0.09, 0.05, 0.05, 0.03, 0.03, 0.02, 0.02]
    return vel * additive(f, seconds, amps, taus) * env(seconds, 0.001, 10, 0.015)


def pad(midis, seconds, vel=1.0, attack=0.3, release=0.35, detune=0.004):
    """Warm string-like pad: detuned stacks of mellow saws with a slow swell."""
    x = tt(seconds)
    s = np.zeros_like(x)
    for m in midis:
        f = midi_hz(m)
        for d in (1 - detune, 1.0, 1 + detune):
            for k in range(1, 6):
                if f * k > 6000:
                    break
                s += np.sin(2 * np.pi * f * d * k * x + k) / k**1.4
    s /= max(len(midis), 1) * 3
    slow = 1 + 0.06 * np.sin(2 * np.pi * 0.35 * x)
    return vel * s * slow * env(seconds, attack, 1e3, release)


def strings_staccato(midis, seconds, vel=1.0):
    p = pad(midis, seconds, vel, attack=0.012, release=min(0.05, seconds / 2), detune=0.006)
    return p * np.exp(-tt(seconds) / (seconds * 0.7))


def brass(midi, seconds, vel=1.0):
    f = midi_hz(midi)
    x = tt(seconds)
    s = additive(f, seconds, [1 / k for k in range(1, 12)], [seconds * 1.5] * 11)
    s *= 1 + 0.5 * np.exp(-x / 0.05)
    s = np.tanh(1.2 * s)
    return vel * s * env(seconds, 0.025, seconds * 0.8, min(0.05, seconds / 3))


def wood_block(vel=1.0, freq=1050):
    x = tt(0.08)
    s = np.sin(2 * np.pi * freq * x) * np.exp(-x / 0.012)
    s += 0.4 * np.sin(2 * np.pi * freq * 1.6 * x) * np.exp(-x / 0.008)
    return vel * s * env(0.08, 0.0005, 10, 0.005)


def clap(vel=1.0):
    x = tt(0.22)
    s = band(noise(0.22), 900, 5000)
    bursts = np.zeros_like(x)
    for at in (0.0, 0.012, 0.024):
        i = int(at * RATE)
        bursts[i:] += np.exp(-(x[: len(x) - i]) / 0.006)
    tail = np.exp(-x / 0.07)
    return vel * s * (0.6 * bursts + 0.5 * tail) * env(0.22, 0.0005, 10, 0.01)


def shaker(vel=1.0):
    return vel * band(noise(0.12), 5000, 12000) * env(0.12, 0.025, 0.035, 0.02)


def tom(freq, vel=1.0, seconds=0.45):
    x = tt(seconds)
    f = freq * (1 + 0.5 * np.exp(-x / 0.04))
    body = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-x / 0.14)
    skin = band(noise(seconds), 200, 1500) * np.exp(-x / 0.015) * 0.5
    return vel * (body + skin) * env(seconds, 0.001, 10, 0.03)


def taiko(freq, vel=1.0):
    x = tt(0.7)
    f = freq * (1 + 0.8 * np.exp(-x / 0.05))
    body = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-x / 0.22)
    thump = band(noise(0.7), 80, 600) * np.exp(-x / 0.02) * 0.6
    return vel * (body + thump) * env(0.7, 0.001, 10, 0.06)


def bell_inharmonic(midi, seconds, vel=1.0):
    f = midi_hz(midi)
    x = tt(seconds)
    partials = ((1, 1, 0.35), (2.32, 0.5, 0.2), (3.7, 0.3, 0.12), (5.1, 0.15, 0.08))
    s = sum(a * np.sin(2 * np.pi * f * r * x) * np.exp(-x / (seconds * d)) for r, a, d in partials)
    return vel * s * env(seconds, 0.002, 10, 0.05)


def glitch_blip(midi, vel=1.0):
    """Bit-crushed square blip, like a corrupted notification."""
    f = midi_hz(midi)
    x = tt(0.05)
    s = np.sign(np.sin(2 * np.pi * f * x))
    s = np.round(s * np.sin(2 * np.pi * 7 * x + 1) * 4) / 4
    return vel * s * env(0.05, 0.0005, 0.02, 0.004)


def riser(seconds, vel=1.0):
    """Filtered-noise riser that swells to the end."""
    x = tt(seconds) / seconds
    s = band(noise(seconds), 1500, 9000) * (x**2.2)
    return vel * s * np.clip((seconds - tt(seconds)) / 0.01, 0, 1)


def drone(midi, seconds, vel=1.0):
    x = tt(seconds)
    f = midi_hz(midi)
    s = np.sin(2 * np.pi * f * x) + 0.5 * np.sin(2 * np.pi * f * 2.003 * x) + 0.25 * np.sin(2 * np.pi * f * 3 * x)
    return vel * s * env(seconds, 0.5, 1e3, 0.5)


# --- Level songs ---------------------------------------------------------------------------------


def sixteenth(bar, i):
    return beat_time(bar, i / 4)


# L2 -- A major, 112 BPM, bright and busy (campaign).
L2_CHORDS = [
    (45, [57, 61, 64, 69]),  # A
    (44, [56, 59, 64, 68]),  # E/G#
    (42, [57, 61, 64, 66]),  # F#m7
    (38, [57, 62, 66, 69]),  # D
    (45, [57, 61, 64, 69]),  # A
    (40, [56, 59, 64, 68]),  # E
    (47, [57, 62, 66, 69]),  # Bm7
    (40, [56, 59, 62, 64]),  # E7
]


def l2_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        arp = [voicing[0], voicing[1], voicing[2], voicing[3], voicing[2], voicing[1], voicing[2], voicing[3]]
        for e in range(8):
            place(track, marimba(arp[e] + (12 if e % 4 == 3 else 0), 0.5, 0.42 if e % 2 == 0 else 0.3), swung(bar, e))
        place(track, pluck_synth(root, BEAT * 1.4, 0.55, 0.3, 0.2), beat_time(bar, 0))
        place(track, pluck_synth(root + 12, BEAT * 0.8, 0.35, 0.3, 0.15), beat_time(bar, 1.5))
        place(track, pluck_synth(root + 7, BEAT * 1.2, 0.45, 0.3, 0.2), beat_time(bar, 2))
        for e in range(8):
            place(track, shaker(0.18 if e % 2 else 0.1), swung(bar, e))
        place(track, kick(0.16), beat_time(bar, 0))
        place(track, kick(0.12), beat_time(bar, 2))
        for beat in (1, 3):
            place(track, wood_block(0.16, 880), beat_time(bar, beat))
    return track


def l2_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        for i in range(16):
            place(track, wood_block(0.3 if i % 4 == 0 else 0.15, 1250 if i % 4 == 0 else 1050), sixteenth(bar, i))
        for beat in (1, 3):
            place(track, clap(0.5), beat_time(bar, beat))
        for e in range(8):
            place(track, pluck_synth(root + (12 if e % 2 else 0), BEAT * 0.4, 0.3, 0.5, 0.12), beat_time(bar, e / 2))
        for beat in (0, 2):
            place(track, kick(0.3), beat_time(bar, beat))
        place(track, kick(0.22), beat_time(bar, 1.5))
        for m in voicing:
            place(track, marimba(m + 12, 0.25, 0.14), beat_time(bar, 3.5))
        if bar % 4 == 3:
            place(track, riser(BEAT * 2, 0.25), beat_time(bar, 2))
    return track


# L3 -- E minor, 120 BPM, electronic pulse (online / viral stories).
L3_CHORDS = [
    (40, [55, 59, 64, 67]),  # Em
    (36, [55, 60, 64, 67]),  # C
    (43, [55, 59, 62, 67]),  # G
    (38, [54, 57, 62, 66]),  # D
    (40, [55, 59, 64, 67]),  # Em
    (36, [55, 60, 64, 67]),  # C
    (45, [57, 60, 64, 69]),  # Am
    (47, [54, 57, 59, 63]),  # B7
]


def l3_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        pattern = [0, 1, 2, 3, 2, 1, 3, 2, 0, 1, 2, 3, 2, 1, 2, 1]
        for i in range(16):
            note = voicing[pattern[i]] + (12 if i % 8 == 6 else 0)
            place(track, pluck_synth(note, 0.3, 0.3 if i % 4 else 0.4, 1.0, 0.16), sixteenth(bar, i))
        place(track, sub_bass(root, BEAT * 3.6, 0.6), beat_time(bar, 0))
        for beat in range(4):
            place(track, kick(0.2), beat_time(bar, beat))
            place(track, hihat(0.14), beat_time(bar, beat + 0.5))
    return track


def l3_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        for i in range(16):
            place(track, saw_bass(root + (12 if i % 4 == 2 else 0), BEAT * 0.22, 0.3, 0.1), sixteenth(bar, i))
            place(track, hihat(0.28 if i % 2 else 0.15), sixteenth(bar, i))
        for beat in range(4):
            place(track, kick(0.3), beat_time(bar, beat))
        for beat in (1, 3):
            place(track, clap(0.5), beat_time(bar, beat))
        for i in (0, 3, 6, 10):
            place(track, glitch_blip(voicing[i % 4] + 24, 0.18), sixteenth(bar, i + 1))
        if bar % 4 == 3:
            place(track, riser(BEAT * 4, 0.3), beat_time(bar, 0))
    return track


# L4 -- G dorian, 98 BPM, swung funk (health stories).
L4_CHORDS = [
    (43, [58, 62, 65, 67]),  # Gm7
    (36, [58, 62, 64, 67]),  # C9
    (43, [58, 62, 65, 67]),  # Gm7
    (38, [57, 60, 62, 65]),  # Dm7
    (39, [55, 58, 62, 67]),  # Ebmaj7
    (38, [57, 60, 62, 66]),  # D7
    (43, [58, 62, 65, 67]),  # Gm7
    (36, [58, 62, 64, 67]),  # C9
]


def l4_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        hits = (0, 3, 5, 6, 10, 12, 14) if bar % 2 == 0 else (0, 2, 5, 8, 11, 13, 15)
        for i in hits:
            for m in voicing[1:]:
                place(track, clav(m, 0.15, 0.17), sixteenth(bar, i))
        bass = [(0, root), (3, root + 12), (6, root + 7), (8, root), (10, root + 3), (14, root + 5)]
        for i, m in bass:
            place(track, slap_bass(m, BEAT * 0.4, 0.5), sixteenth(bar, i))
        for i in range(16):
            place(track, hihat(0.22 if i % 4 == 2 else 0.12 if i % 2 else 0.17), sixteenth(bar, i))
        for i in (0, 7, 10):
            place(track, kick(0.3), sixteenth(bar, i))
        for beat in (1, 3):
            place(track, snare(0.38), beat_time(bar, beat))
    return track


def l4_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        riff = [0, 2, 3, 6, 8, 10, 11, 14]
        for k, i in enumerate(riff):
            place(track, pluck_synth(voicing[k % 4] + 12, 0.14, 0.26, 1.6, 0.07), sixteenth(bar, i))
        for at in (2.5, 3.5):
            for m in voicing:
                place(track, brass(m, BEAT * 0.35, 0.1), beat_time(bar, at))
        for i in range(0, 16, 2):
            place(track, tom(180 + 40 * ((i // 2) % 3), 0.12), sixteenth(bar, i + 1))
        for i in range(16):
            place(track, shaker(0.14), sixteenth(bar, i))
        if bar % 4 == 3:
            place(track, riser(BEAT * 2, 0.22), beat_time(bar, 2))
    return track


# L5 -- C minor, 126 BPM, uneasy (deepfakes).
L5_CHORDS = [
    (36, [55, 60, 63, 67]),  # Cm
    (44, [56, 60, 63, 68]),  # Ab
    (41, [56, 60, 65, 68]),  # Fm
    (43, [53, 59, 62, 67]),  # G7
    (36, [55, 60, 63, 67]),  # Cm
    (44, [56, 60, 63, 68]),  # Ab
    (37, [56, 61, 65, 68]),  # Db
    (43, [53, 59, 62, 66]),  # G7b5
]


def l5_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        place(track, pad(voicing, BEAT * 4.2, 0.6, 0.6, 0.5), beat_time(bar, 0))
        place(track, sub_bass(root, BEAT * 3.9, 0.55), beat_time(bar, 0))
        # Heartbeat: lub-dub.
        place(track, kick(0.3), beat_time(bar, 0))
        place(track, kick(0.18), beat_time(bar, 0.75))
        place(track, kick(0.3), beat_time(bar, 2))
        place(track, kick(0.18), beat_time(bar, 2.75))
        if bar % 2 == 0:
            place(track, bell_inharmonic(voicing[3] + 12, 2.2, 0.16), beat_time(bar, 1.5))
        else:
            place(track, bell_inharmonic(voicing[1] + 24, 2.2, 0.1), beat_time(bar, 3))
        place(track, hihat(0.1), beat_time(bar, 1.5))
    return track


def l5_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        for e in range(8):
            place(track, saw_bass(root + (12 if e in (3, 7) else 0), BEAT * 0.45, 0.3, 0.2), beat_time(bar, e / 2))
        for i in range(16):
            if (i * 7 + bar * 3) % 5 in (0, 2):
                place(track, glitch_blip(voicing[i % 4] + 24 + (12 if i % 3 == 0 else 0), 0.2), sixteenth(bar, i))
        for beat in range(4):
            place(track, kick(0.3), beat_time(bar, beat))
            place(track, hihat(0.2), beat_time(bar, beat + 0.5))
        place(track, snare(0.4), beat_time(bar, 1))
        place(track, snare(0.4), beat_time(bar, 3))
        if bar % 2 == 1:
            for m in (voicing[0] + 1, voicing[2] + 6, voicing[3] + 12):
                place(track, strings_staccato([m], BEAT * 0.4, 0.3), beat_time(bar, 3.5))
        if bar % 4 == 3:
            place(track, riser(BEAT * 4, 0.28), beat_time(bar, 0))
    return track


# L6 -- F# minor, 132 BPM, heroic and relentless (the attack).
L6_CHORDS = [
    (42, [57, 61, 64, 66]),  # F#m
    (38, [57, 62, 66, 69]),  # D
    (45, [57, 61, 64, 69]),  # A
    (40, [56, 59, 64, 68]),  # E
    (42, [57, 61, 64, 66]),  # F#m
    (38, [57, 62, 66, 69]),  # D
    (47, [57, 62, 66, 69]),  # Bm
    (37, [56, 61, 65, 68]),  # C#7
]


def l6_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        place(track, drone(root - 12, BEAT * 4.1, 0.35), beat_time(bar, 0))
        for i in range(8):
            place(track, strings_staccato([voicing[i % 4]], BEAT * 0.4, 0.28 if i % 2 == 0 else 0.2), beat_time(bar, i / 2))
        place(track, taiko(70, 0.55), beat_time(bar, 0))
        place(track, taiko(70, 0.4), beat_time(bar, 2))
        place(track, taiko(95, 0.3), beat_time(bar, 3.5))
        place(track, hihat(0.12), beat_time(bar, 1))
        place(track, hihat(0.12), beat_time(bar, 3))
    return track


def l6_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        for i in range(16):
            place(track, strings_staccato([voicing[i % 3] + 12], BEAT * 0.2, 0.2), sixteenth(bar, i))
        for beat in (0, 2):
            for m in voicing:
                place(track, brass(m, BEAT * 0.9, 0.11), beat_time(bar, beat))
        for beat in range(4):
            place(track, taiko(75 + 12 * (beat % 2), 0.5), beat_time(bar, beat))
        for i in range(16):
            place(track, hihat(0.2 if i % 2 else 0.12), sixteenth(bar, i))
        for beat in (1, 3):
            place(track, snare(0.5), beat_time(bar, beat))
        if bar % 4 == 3:
            for i in range(8):
                place(track, snare(0.15 + 0.04 * i), beat_time(bar, 3 + i / 8))
            place(track, riser(BEAT * 3, 0.25), beat_time(bar, 0))
    return track


# Endless -- Bb minor, 116 BPM, hybrid and evolving.
LE_CHORDS = [
    (34, [58, 61, 65, 68]),  # Bbm7
    (42, [57, 61, 66, 70]),  # Gb
    (37, [56, 61, 65, 68]),  # Db
    (44, [56, 60, 63, 68]),  # Ab
    (34, [58, 61, 65, 68]),  # Bbm7
    (42, [57, 61, 66, 70]),  # Gb
    (39, [58, 63, 66, 70]),  # Ebm
    (41, [57, 60, 63, 67]),  # F7
]


def le_calm():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        place(track, pad(voicing, BEAT * 4.1, 0.4, 0.4, 0.4), beat_time(bar, 0))
        for e in range(8):
            if (e + bar) % 3 == 2:
                continue
            place(track, marimba(voicing[(e * 3 + bar) % 4] + 12, 0.6, 0.32), beat_time(bar, e / 2))
        for e in range(8):
            m = root + (7 if e == 5 else 12 if e % 4 == 3 else 0)
            place(track, saw_bass(m, BEAT * 0.4, 0.28, 0.15), beat_time(bar, e / 2))
        place(track, kick(0.24), beat_time(bar, 0))
        place(track, kick(0.18), beat_time(bar, 2.5))
        place(track, wood_block(0.14, 800), beat_time(bar, 1))
        place(track, wood_block(0.14, 800), beat_time(bar, 3))
        place(track, shaker(0.12), beat_time(bar, 1.5))
    return track


def le_pressure():
    track = np.zeros(LOOP_N)
    for bar in range(BARS):
        root, voicing = bar_chord(bar)
        for i in range(16):
            place(track, pluck_synth(voicing[(i + bar) % 4] + 12, 0.14, 0.24, 1.8, 0.06), sixteenth(bar, i))
            place(track, hihat(0.24 if i % 2 else 0.14), sixteenth(bar, i))
        for beat in range(4):
            place(track, kick(0.3), beat_time(bar, beat))
        for beat in (1, 3):
            place(track, snare(0.45), beat_time(bar, beat))
            place(track, clap(0.3), beat_time(bar, beat))
        if bar % 2:
            for i in range(4):
                place(track, snare(0.18 + 0.05 * i), beat_time(bar, 3 + i / 4))
        place(track, tom(110, 0.3), beat_time(bar, 2.5))
        if bar % 4 == 3:
            place(track, riser(BEAT * 4, 0.28), beat_time(bar, 0))
    return track


SONGS = {
    # id: (bpm, swing, chords, calm builder, pressure builder)
    "l1": (104, 0.62, L1_CHORDS, calm_track, pressure_track),
    "l2": (112, 0.5, L2_CHORDS, l2_calm, l2_pressure),
    "l3": (120, 0.5, L3_CHORDS, l3_calm, l3_pressure),
    "l4": (98, 0.58, L4_CHORDS, l4_calm, l4_pressure),
    "l5": (126, 0.5, L5_CHORDS, l5_calm, l5_pressure),
    "l6": (132, 0.5, L6_CHORDS, l6_calm, l6_pressure),
    "endless": (116, 0.5, LE_CHORDS, le_calm, le_pressure),
}

# --- Output --------------------------------------------------------------------------------------

# Loudness targets (RMS, dBFS) of each file; the client mixes calm + pressure with these in mind.
TARGET_RMS_DB = {"menu": -21.0, "calm": -21.0, "pressure": -23.0}
PEAK_CEILING = 0.89


def shape(signal):
    """Low-end shelf (-8 dB below ~150 Hz, high-passed at 40 Hz): phone speakers cannot play the
    bass, and bass-heavy RMS would otherwise make everything above it too quiet."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    shelf = 0.4 + 0.6 * np.clip(np.log2(np.maximum(f, 1.0) / 90) / 1.2, 0, 1)
    hp = np.clip((f - 25) / 25, 0, 1)
    return np.fft.irfft(spec * shelf * hp, len(signal))


def to_target(signal, rms_db):
    """Scales to an RMS target, then rounds peaks with a tanh so nothing exceeds the ceiling."""
    signal = shape(signal)
    rms = float(np.sqrt(np.mean(signal**2))) or 1.0
    s = signal / rms * 10 ** (rms_db / 20)
    k = PEAK_CEILING * 0.8
    if float(np.max(np.abs(s))) > k:
        s = k * np.tanh(s / k)
        s *= 10 ** (rms_db / 20) / (float(np.sqrt(np.mean(s**2))) or 1.0)
    return np.clip(s, -PEAK_CEILING, PEAK_CEILING)


BANDS = ((0, 250), (250, 2000), (2000, 8000), (8000, RATE / 2 + 1))
BAND_LABELS = ("low", "mid", "high", "air")


def report(name, signal):
    peak = float(np.max(np.abs(signal)))
    rms = float(np.sqrt(np.mean(signal**2)))
    power = np.abs(np.fft.rfft(signal)) ** 2
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    total = np.sum(power) or 1
    bands = [np.sum(power[(f >= lo) & (f < hi)]) / total * 100 for lo, hi in BANDS]
    seam = float(abs(signal[0] - signal[-1]))
    shares = " ".join(f"{label} {share:4.1f}%" for label, share in zip(BAND_LABELS, bands))
    print(
        f"{name:17s} peak {20 * np.log10(peak):6.1f} dBFS  rms {20 * np.log10(rms):6.1f} dBFS  "
        f"crest {20 * np.log10(peak / rms):4.1f} dB  {shares}  seam {seam:.4f}",
        file=sys.stderr,
    )
    assert peak <= 1.0 and rms > 0.02, f"{name}: level out of range"
    assert seam < 0.08, f"{name}: loop seam discontinuity"


def encode(name, signal):
    pcm = (np.clip(signal, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / f"{name}.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        for ext, args in (
            ("webm", ["-c:a", "libopus", "-b:a", "22k", "-application", "audio"]),
            ("mp3", ["-c:a", "libmp3lame", "-b:a", "32k"]),
        ):
            cmd = ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", "-ar", str(ENCODE_RATE), *args, str(OUT / f"{name}.{ext}")]
            subprocess.run(cmd, check=True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.iterdir():
        old.unlink()
    manifest = {}
    # Menu: D minor noir jazz (the level-1 key and tempo, so the lobby flows into level 1).
    configure(104, 0.62, L1_CHORDS)
    menu = to_target(menu_track(), TARGET_RMS_DB["menu"])
    report("menu", menu)
    encode("menu", menu)
    manifest["menu"] = {"bpm": 104, "bars": BARS, "loopMs": round(LOOP_S * 1000, 3)}
    for song, (bpm, swing, chords, calm_fn, pressure_fn) in SONGS.items():
        configure(bpm, swing, chords)
        calm = to_target(calm_fn(), TARGET_RMS_DB["calm"])
        pressure = to_target(pressure_fn(), TARGET_RMS_DB["pressure"])
        report(song, calm)
        report(song + "-pressure", pressure)
        report(song + " both", np.clip(calm * 0.65 + pressure, -1, 1))
        encode(song, calm)
        encode(song + "-pressure", pressure)
        manifest[song] = {"bpm": bpm, "bars": BARS, "loopMs": round(LOOP_S * 1000, 3)}
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
    for ext in ("webm", "mp3"):
        total = sum(p.stat().st_size for p in OUT.glob(f"*.{ext}"))
        print(f"total {ext}: {total / 1024:.0f} KiB", file=sys.stderr)


if __name__ == "__main__":
    main()
