#!/usr/bin/env python3
"""Synthesises the sound effects and packs them into one audio sprite (final-quality pass, S5-08).

All sounds are generated here from oscillators and filtered noise, so they are self-made and
free of licensing questions (agents/game-feel.md, design-rules.md). Keep the sprite ids stable;
new ids go at the end of SOUNDS. Every sound goes through `finish()`: click-free fades, DC removal,
and a loudness target per class (see LEVELS), so the mix is consistent whatever the source.
Offsets in the sprite change whenever a sound's length does; the json is regenerated with the audio.

Usage: python3 tools/audio/synth_placeholders.py   (requires numpy and ffmpeg)
Outputs:
  apps/client/public/assets/audio/sfx.webm, sfx.mp3     the sprite (mono, 32 kHz)
  apps/client/src/fx/audio/sfx-sprite.json              id -> [offset ms, duration ms, loop]
"""
import json
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

RATE = 44100
ROOT = Path(__file__).resolve().parents[2]
OUT_AUDIO = ROOT / "apps/client/public/assets/audio"
OUT_JSON = ROOT / "apps/client/src/fx/audio/sfx-sprite.json"
GAP_S = 0.12
rng = np.random.default_rng(1729)


def t(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def env(length, attack, decay):
    """Exponential decay envelope with a linear attack, both in seconds."""
    n = int(RATE * length)
    x = np.arange(n) / RATE
    a = np.clip(x / max(attack, 1e-4), 0, 1)
    return a * np.exp(-x / decay)


def lowpass(signal, cutoff):
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    out = np.empty_like(signal)
    acc = 0.0
    for i, v in enumerate(signal):
        acc += alpha * (v - acc)
        out[i] = acc
    return out


def highpass(signal, cutoff):
    return signal - lowpass(signal, cutoff)


def noise(seconds):
    return rng.uniform(-1, 1, int(RATE * seconds))


def band(signal, low=0.0, high=None):
    """Zero-phase FFT band filter with soft (one-octave) skirts; fast for long signals."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    mask = np.ones_like(f)
    if low > 0:
        mask *= np.clip(np.log2(np.maximum(f, 1e-3) / low) + 1, 0, 1)
    if high is not None:
        mask *= np.clip(1 - np.log2(np.maximum(f, 1e-3) / high), 0, 1)
    return np.fft.irfft(spec * mask, len(signal))


def transient(seconds=0.012, low=2500, gain=1.0):
    """A short, bright noise tick that gives a sound a defined attack."""
    n = noise(seconds)
    return gain * band(n, low, 14000) * env(seconds, 0.0003, seconds / 3)


def thump(freq=60, seconds=0.25, decay=0.07, drop=0.6):
    """Low body of an impact: a sine whose pitch falls quickly."""
    x = t(seconds)
    f = freq * (1 + drop * np.exp(-x / 0.025))
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * env(seconds, 0.001, decay)


def bell(freq, seconds, decay, partials=((1, 1.0), (2.76, 0.35), (5.4, 0.12))):
    x = t(seconds)
    s = sum(a * np.sin(2 * np.pi * freq * r * x) for r, a in partials)
    s = s * env(seconds, 0.002, decay)
    # Mallet strike: a tiny noise tick so the bell has a clear onset.
    s[: int(RATE * 0.01)] += 0.25 * transient(0.01, 3000)[: int(RATE * 0.01)]
    return s


def normalize(signal, peak):
    m = np.max(np.abs(signal)) or 1
    return signal / m * peak


def click():
    """Typewriter key: sharp filtered noise transient plus a short wooden knock."""
    s = highpass(noise(0.06), 1800) * env(0.06, 0.0005, 0.008)
    s += 0.5 * np.sin(2 * np.pi * 420 * t(0.06)) * env(0.06, 0.0005, 0.012)
    return normalize(s, 0.7)


def hover():
    """Soft paper tick."""
    s = highpass(noise(0.04), 3000) * env(0.04, 0.001, 0.006)
    return normalize(s, 0.25)


def back():
    s = 0.6 * np.sin(2 * np.pi * 260 * t(0.08)) * env(0.08, 0.0005, 0.02)
    s += highpass(noise(0.08), 1200) * env(0.08, 0.0005, 0.006) * 0.5
    return normalize(s, 0.6)


def copy_ding():
    """Typewriter carriage bell."""
    return normalize(bell(2093, 0.7, 0.18), 0.5)


def join_chime():
    a = bell(659, 0.9, 0.25)
    b = np.concatenate([np.zeros(int(RATE * 0.11)), bell(988, 0.79, 0.3)])
    return normalize(a + b, 0.55)


def leave_chime():
    a = bell(784, 0.8, 0.22)
    b = np.concatenate([np.zeros(int(RATE * 0.12)), bell(523, 0.68, 0.28)])
    return normalize(a + b, 0.45)


def step(variant):
    """Soft shoe on wooden floor: low thump plus a little scuff."""
    freq = 95 if variant == 1 else 110
    s = np.sin(2 * np.pi * freq * t(0.11)) * env(0.11, 0.002, 0.025)
    s += 0.35 * lowpass(noise(0.11), 900) * env(0.11, 0.003, 0.03)
    return normalize(s, 0.45)


def desk_bell():
    """Reception desk bell — the newsroom's 'start'."""
    return normalize(bell(1318, 1.4, 0.45, ((1, 1.0), (2.4, 0.5), (4.1, 0.2), (6.3, 0.08))), 0.6)


def stamp_thud():
    """Rubber stamp on a desk: low body thump, wood knock, paper slap."""
    s = np.sin(2 * np.pi * 70 * t(0.3)) * env(0.3, 0.001, 0.06)
    s += 0.6 * np.sin(2 * np.pi * 180 * t(0.3)) * env(0.3, 0.001, 0.025)
    s += 0.5 * highpass(noise(0.3), 1500) * env(0.3, 0.0005, 0.01)
    s += 0.9 * thump(52, 0.3, 0.09)
    s[: int(RATE * 0.012)] += 0.5 * transient(0.012, 1800)[: int(RATE * 0.012)]
    return normalize(s, 0.9)


def roomtone():
    """Quiet newsroom bed: brown noise with slow swell. Seamless loop via crossfade."""
    seconds = 4.0
    n = int(RATE * seconds)
    fade = int(RATE * 0.5)
    raw = np.cumsum(noise(seconds + 0.5)) * 0.02
    raw = highpass(raw, 60)
    raw = lowpass(raw, 700)
    swell = 0.85 + 0.15 * np.sin(2 * np.pi * np.arange(len(raw)) / len(raw))
    raw = raw * swell
    body = raw[:n].copy()
    tail = raw[n:n + fade]
    ramp = np.linspace(0, 1, fade)
    body[:fade] = body[:fade] * ramp + tail * (1 - ramp)
    return normalize(body, 0.18)


# --- Core gameplay feedback (S2-12) ------------------------------------------------------------


def delayed(signal, seconds):
    return np.concatenate([np.zeros(int(RATE * seconds)), signal])


def mix(*signals):
    n = max(len(x) for x in signals)
    out = np.zeros(n)
    for x in signals:
        out[: len(x)] += x
    return out


def tone(freq, seconds, attack, decay, shape="sine"):
    x = t(seconds)
    phase = 2 * np.pi * freq * x
    if shape == "square":
        wave_ = np.sign(np.sin(phase)) * 0.6 + 0.4 * np.sin(phase)
    elif shape == "saw":
        wave_ = 2 * ((freq * x) % 1) - 1
    else:
        wave_ = np.sin(phase)
    return wave_ * env(seconds, attack, decay)


def arrive_bell():
    """Folder lands on the conveyor: short counter bell, two strikes."""
    a = bell(1568, 0.45, 0.14, ((1, 1.0), (2.4, 0.4), (4.1, 0.15)))
    return normalize(mix(a, delayed(0.6 * a[: int(RATE * 0.3)], 0.09)), 0.5)


def paper_rustle():
    """Folder picked up: band-limited noise with a few crinkle bursts."""
    n = 0.25
    s = highpass(lowpass(noise(n), 6000), 900)
    crinkle = np.zeros(int(RATE * n))
    for start in (0.0, 0.05, 0.11, 0.16):
        i = int(RATE * start)
        burst = env(0.05, 0.002, 0.012)
        crinkle[i : i + len(burst)] += burst[: len(crinkle) - i]
    return normalize(s * (0.3 * env(n, 0.01, 0.08) + crinkle), 0.45)


def paper_place():
    """Folder put down: soft slap on wood."""
    s = 0.7 * np.sin(2 * np.pi * 140 * t(0.2)) * env(0.2, 0.001, 0.03)
    s += 0.6 * lowpass(noise(0.2), 2500) * env(0.2, 0.001, 0.02)
    return normalize(s, 0.55)


def warn_ticks():
    """Deadline warning: two quick wooden ticks, the second higher."""
    a = tone(1200, 0.06, 0.0005, 0.012) + 0.4 * highpass(noise(0.06), 2500) * env(0.06, 0.0005, 0.006)
    b = tone(1600, 0.06, 0.0005, 0.012) + 0.4 * highpass(noise(0.06), 2500) * env(0.06, 0.0005, 0.006)
    return normalize(mix(a, delayed(b, 0.14)), 0.5)


def clock_tick():
    """One clock tick for the deadline ticker (playback rate varies tick/tock)."""
    s = tone(2400, 0.05, 0.0003, 0.006) + 0.6 * highpass(noise(0.05), 3000) * env(0.05, 0.0003, 0.004)
    return normalize(s, 0.45)


def expiry_buzzer():
    """Folder expired: dull buzzer, a falling square wave."""
    x = t(0.5)
    f = 180 - 40 * x
    phase = 2 * np.pi * np.cumsum(f) / RATE
    s = (np.sign(np.sin(phase)) * 0.5 + 0.5 * np.sin(phase)) * env(0.5, 0.005, 0.25)
    return normalize(lowpass(s, 1800), 0.55)


def typewriter_loop():
    """Station work loop: irregular typewriter keys over one second, seamless (no tail)."""
    seconds = 1.0
    n = int(RATE * seconds)
    out = np.zeros(n)
    times = [0.02, 0.11, 0.19, 0.31, 0.38, 0.47, 0.6, 0.67, 0.78, 0.86]
    for k, start in enumerate(times):
        key = highpass(noise(0.05), 1800) * env(0.05, 0.0005, 0.007)
        key += 0.5 * np.sin(2 * np.pi * (380 + 30 * (k % 3)) * t(0.05)) * env(0.05, 0.0005, 0.01)
        i = int(RATE * start)
        out[i : i + len(key)] += key[: n - i] * (0.8 + 0.2 * ((k * 7) % 3) / 2)
    return normalize(out, 0.45)


def minigame_slide():
    """Minigame sheet slides in: short airy paper whoosh."""
    s = highpass(lowpass(noise(0.25), 5000), 600) * env(0.25, 0.06, 0.06)
    return normalize(s, 0.4)


def fail_buzz():
    """Minigame failed: two short low blips going down."""
    a = tone(330, 0.12, 0.002, 0.05, "square")
    b = tone(220, 0.2, 0.002, 0.08, "square")
    return normalize(lowpass(mix(a, delayed(b, 0.13)), 2200), 0.45)


def desk_open():
    """Desk opened: drawer knock plus paper flap."""
    s = 0.8 * np.sin(2 * np.pi * 210 * t(0.25)) * env(0.25, 0.001, 0.035)
    s += 0.4 * highpass(lowpass(noise(0.25), 5000), 800) * env(0.25, 0.02, 0.05)
    return normalize(s, 0.5)


def correct_chime():
    """Correct verdict: rising major arpeggio on bells."""
    notes = (784, 988, 1175)
    return normalize(mix(*[delayed(bell(f, 0.5, 0.18), i * 0.08) for i, f in enumerate(notes)]), 0.5)


def context_fanfare():
    """Correct "publish with context": longer arpeggio ending on a held chord."""
    notes = (659, 784, 988, 1319)
    parts = [delayed(bell(f, 0.6, 0.2), i * 0.09) for i, f in enumerate(notes)]
    parts.append(delayed(bell(1319, 0.7, 0.35) + bell(988, 0.7, 0.35), 0.36))
    return normalize(mix(*parts), 0.55)


def wrong_hmm():
    """Right verdict, wrong justification: an unsure two-note dip."""
    a = tone(440, 0.2, 0.01, 0.1)
    b = tone(392, 0.25, 0.01, 0.12)
    return normalize(mix(a, delayed(b, 0.18)), 0.4)


def alarm_sting():
    """Fake published: urgent two-tone alarm, three cycles, harsh but not piercing."""
    parts = []
    for i in range(3):
        parts.append(delayed(tone(740, 0.14, 0.003, 0.2, "saw"), i * 0.3))
        parts.append(delayed(tone(554, 0.14, 0.003, 0.2, "saw"), i * 0.3 + 0.15))
    s = lowpass(mix(*parts), 2600)
    s = mix(s, 0.8 * np.sin(2 * np.pi * 60 * t(0.4)) * env(0.4, 0.002, 0.12))
    return normalize(s, 0.6)


def low_sting():
    """True story rejected: a low descending minor figure."""
    a = tone(294, 0.3, 0.01, 0.2, "saw")
    b = tone(233, 0.5, 0.01, 0.3, "saw")
    return normalize(lowpass(mix(a, delayed(b, 0.22)), 1200), 0.5)


def last_seconds():
    """Last 30 s: a clock striking twice over a low pulse."""
    a = bell(880, 0.5, 0.2, ((1, 1.0), (2.0, 0.4), (3.0, 0.2)))
    pulse = 0.6 * np.sin(2 * np.pi * 70 * t(0.7)) * env(0.7, 0.005, 0.2)
    return normalize(mix(a, delayed(a, 0.25), pulse), 0.55)


def win_stinger():
    """Level won: bright bell fanfare."""
    notes = (523, 659, 784, 1047)
    parts = [delayed(bell(f, 0.6, 0.22), i * 0.11) for i, f in enumerate(notes)]
    parts.append(delayed(bell(1047, 1.0, 0.5) + bell(784, 1.0, 0.5) + bell(659, 1.0, 0.5), 0.5))
    parts.append(delayed(0.5 * bell(262, 1.2, 0.6, ((1, 1.0), (2.0, 0.3))), 0.5))
    parts.append(delayed(highpass(noise(0.6), 6000) * env(0.6, 0.002, 0.12) * 0.1, 0.5))
    return normalize(mix(*parts), 0.6)


def lose_stinger():
    """Level lost: slow falling bells into a low thud."""
    notes = (523, 466, 392, 311)
    parts = [delayed(bell(f, 0.7, 0.3), i * 0.22) for i, f in enumerate(notes)]
    parts.append(delayed(thump(55, 0.6, 0.2, 0.4), 0.9))
    parts.append(delayed(lowpass(noise(0.3), 500) * env(0.3, 0.002, 0.06) * 0.5, 0.9))
    return normalize(mix(*parts), 0.55)


def ping_bell(freq):
    """Ping: one short bell per ping kind (pitch tells them apart, the bubble icon too)."""
    return normalize(bell(freq, 0.3, 0.09, ((1, 1.0), (2.76, 0.3))), 0.45)


# --- Newsroom ambience (S3-07): quiet, distant one-shots over the room tone -----------------------


def distant(signal, cutoff=2200):
    """Pushes a sound into the background: duller and softer."""
    return lowpass(signal, cutoff)


def amb_phone():
    """A desk phone ringing in another room: two short trills of a two-tone bell."""
    def trill(seconds):
        x = t(seconds)
        bell_ = np.sin(2 * np.pi * 1240 * x) + 0.6 * np.sin(2 * np.pi * 1480 * x)
        hammer = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 22 * x))
        gate = np.clip(x / 0.01, 0, 1) * np.clip((seconds - x) / 0.04, 0, 1)
        return bell_ * hammer * gate
    ring = trill(0.9)
    out = mix(ring, delayed(ring, 1.35))
    return normalize(distant(out, 2600), 0.32)


def amb_printer():
    """A dot-matrix printer line burst: buzzy head passes with a paper feed thunk."""
    out = []
    for i, seconds in enumerate((0.42, 0.36, 0.48)):
        x = t(seconds)
        buzz = np.sign(np.sin(2 * np.pi * (480 + 40 * i) * x)) * (0.6 + 0.4 * np.sin(2 * np.pi * 37 * x))
        head = highpass(noise(seconds), 1500) * 0.5
        gate = np.clip(x / 0.01, 0, 1) * np.clip((seconds - x) / 0.02, 0, 1)
        out.append((0.5 * buzz + head) * gate)
        feed = 0.8 * np.sin(2 * np.pi * 110 * t(0.12)) * env(0.12, 0.002, 0.03)
        out.append(feed)
        out.append(np.zeros(int(RATE * 0.08)))
    return normalize(distant(np.concatenate(out), 2400), 0.28)


def amb_fax():
    """A fax machine handshake far away: a few beeps and a warbling carrier."""
    beeps = [tone(1100, 0.35, 0.005, 2.0) * np.clip((0.35 - t(0.35)) / 0.02, 0, 1)]
    beeps.append(np.zeros(int(RATE * 0.25)))
    x = t(0.9)
    warble = np.sin(2 * np.pi * (1650 + 350 * np.sign(np.sin(2 * np.pi * 9 * x))) * x)
    warble *= np.clip(x / 0.03, 0, 1) * np.clip((0.9 - x) / 0.05, 0, 1)
    beeps.append(0.7 * warble)
    return normalize(distant(np.concatenate(beeps), 2000), 0.22)


def amb_typing():
    """A colleague typing at the far end of the room: a soft, irregular burst of keys."""
    seconds = 2.2
    n = int(RATE * seconds)
    out = np.zeros(n)
    start = 0.05
    k = 0
    while start < seconds - 0.1:
        key = highpass(noise(0.05), 1500) * env(0.05, 0.0005, 0.008)
        key += 0.4 * np.sin(2 * np.pi * (360 + 25 * (k % 4)) * t(0.05)) * env(0.05, 0.0005, 0.01)
        i = int(RATE * start)
        out[i : i + len(key)] += key[: n - i] * (0.6 + 0.4 * rng.random())
        start += 0.07 + 0.12 * rng.random() + (0.35 if rng.random() < 0.08 else 0)
        k += 1
    fade = np.clip(np.arange(n) / (RATE * 0.2), 0, 1) * np.clip((n - np.arange(n)) / (RATE * 0.4), 0, 1)
    return normalize(distant(out * fade, 1800), 0.25)


# --- Level events (S4-05..S4-09): announce stingers, appended last so earlier sounds stay identical ---


def ev_viral():
    """Viral: a quick run of rising notification pops with a soft whomp and a sparkle on top."""
    parts = [delayed(bell(f, 0.2, 0.06, ((1, 1.0), (2.0, 0.3))), i * 0.085) for i, f in enumerate((880, 1109, 1397, 1760))]
    parts.append(0.6 * thump(120, 0.2, 0.05, 0.5))
    parts.append(delayed(highpass(noise(0.2), 6000) * env(0.2, 0.002, 0.05) * 0.18, 0.25))
    return normalize(mix(*parts), 0.55)

def ev_boss():
    """Boss call: a desk phone ringing twice (two-tone bell, fast tremolo) after a handset clack."""
    parts = [transient(0.02, 800, 0.5)]
    for i in range(2):
        x = t(0.36)
        ring = (np.sin(2 * np.pi * 440 * x) + np.sin(2 * np.pi * 480 * x)) * (0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 22 * x)))
        ring += 0.25 * (np.sin(2 * np.pi * 880 * x) + np.sin(2 * np.pi * 960 * x))
        parts.append(delayed(ring * env(0.36, 0.004, 0.4), 0.03 + i * 0.5))
    return normalize(lowpass(mix(*parts), 3600), 0.6)

def ev_raid():
    """Bot raid: a glitchy, bit-crushed stutter falling in pitch, with a digital thud and ticks."""
    n = int(RATE * 0.6)
    x = np.arange(n) / RATE
    sweep = np.sign(np.sin(2 * np.pi * np.cumsum(700 * np.exp(-3.2 * x)) / RATE)) * 0.5
    gate = (np.floor(x * 24) % 3 != 2).astype(float)
    crushed = np.round(sweep * 6) / 6
    hiss = highpass(noise(0.6), 2500) * 0.25 * gate
    body = lowpass((crushed * gate + hiss) * env(0.6, 0.002, 0.5), 5000)
    ticks = np.zeros(n)
    for at in (0.0, 0.11, 0.2, 0.33):
        i = int(RATE * at)
        tick = tone(2600, 0.02, 0.0003, 0.004)
        ticks[i : i + len(tick)] += tick[: n - i] * 0.5
    return normalize(mix(body, ticks, 0.9 * thump(70, 0.3, 0.07)), 0.55)

def ev_outage():
    """Outage: a relay clack, power cutting out in a falling hum and a few electric crackles."""
    n = int(RATE * 0.8)
    x = np.arange(n) / RATE
    hum = np.sin(2 * np.pi * np.cumsum(520 * np.exp(-3.5 * x) + 45) / RATE) * env(0.8, 0.003, 0.35)
    crackle = np.zeros(n)
    for at in (0.05, 0.19, 0.27, 0.46, 0.58):
        i = int(RATE * at)
        burst = highpass(noise(0.05), 1500) * env(0.05, 0.0005, 0.012)
        crackle[i : i + len(burst)] += burst[: n - i]
    clack = mix(0.8 * transient(0.02, 600), 0.6 * thump(90, 0.2, 0.04))
    return normalize(mix(hum * 0.7, crackle * 0.8, clack), 0.6)

def ev_correction():
    """Correction: a newsroom siren, rising-falling sweeps, with an alert tick and a low pulse."""
    n = int(RATE * 0.9)
    x = np.arange(n) / RATE
    freq = 760 + 220 * np.sin(2 * np.pi * 3.3 * x - np.pi / 2)
    phase = 2 * np.pi * np.cumsum(freq) / RATE
    wave_ = np.sign(np.sin(phase)) * 0.5 + 0.5 * np.sin(phase)
    siren = lowpass(wave_ * env(0.9, 0.01, 0.8), 2800)
    return normalize(mix(siren, 0.7 * transient(0.015, 1500), 0.6 * thump(80, 0.4, 0.1)), 0.55)

def ev_clear():
    """Raid solved: a bright rising arpeggio with a little sparkle."""
    parts = [delayed(bell(f, 0.4, 0.14), i * 0.07) for i, f in enumerate((1047, 1319, 1568, 2093))]
    sparkle = highpass(noise(0.3), 5000) * env(0.3, 0.001, 0.07) * 0.12
    return normalize(mix(*parts, delayed(sparkle, 0.2)), 0.55)


def ev_back():
    """Station back online: power coming up, a rising sweep and a soft confirm chime."""
    n = int(RATE * 0.35)
    x = np.arange(n) / RATE
    sweep = np.sin(2 * np.pi * np.cumsum(120 + 900 * x / 0.35) / RATE) * env(0.35, 0.01, 0.2)
    return normalize(mix(sweep * 0.6, delayed(bell(1319, 0.35, 0.12), 0.25)), 0.5)


def ev_zap():
    """A small spark crackle for a down station (quiet, repeated)."""
    s = highpass(noise(0.14), 1800) * env(0.14, 0.0005, 0.03)
    s += 0.5 * highpass(noise(0.14), 3500) * np.roll(env(0.14, 0.0005, 0.02), 900)
    return normalize(s, 0.35)


def formant(signal, centre, width=0.16):
    """Narrow spectral peak around `centre` Hz (a vowel formant)."""
    spec = np.fft.rfft(signal)
    f = np.fft.rfftfreq(len(signal), 1 / RATE)
    mask = np.exp(-0.5 * (np.log2(np.maximum(f, 1.0) / centre) / width) ** 2)
    return np.fft.irfft(spec * mask, len(signal))


def amb_chatter():
    """Voice-less newsroom chatter: syllable-like blips (a buzzy source through two vowel formants,
    no words) from three 'speakers', over a muffled murmur. A 10 s seamless loop; the client plays
    it very quietly and ducks it under overlays."""
    seconds = 10.0
    n = int(RATE * seconds)
    out = np.zeros(n)
    speakers = [(108, 0.9), (150, 1.05), (210, 1.25)]  # (pitch Hz, formant scale)
    vowels = [(730, 1090), (530, 1840), (270, 2290), (570, 840), (390, 1990)]
    xs = np.arange(n) / RATE
    murmur = band(noise(seconds), 250, 1400) * (0.6 + 0.4 * np.sin(2 * np.pi * xs / seconds * 3 + 1.0))
    out += 0.5 * murmur / (np.max(np.abs(murmur)) or 1)
    phrase_starts = [0.3, 1.9, 3.4, 4.6, 6.2, 7.7, 8.9]
    for pi, start in enumerate(phrase_starts):
        pitch, fscale = speakers[pi % 3]
        at = start
        for _ in range(3 + (pi * 2) % 4):
            dur = 0.07 + 0.08 * rng.random()
            v1, v2 = vowels[int(rng.integers(len(vowels)))]
            m = int(RATE * dur)
            sx = np.arange(m) / RATE
            f0 = pitch * (1 + 0.08 * (0.5 - sx / dur)) * (1 + 0.04 * rng.random())
            ph = np.cumsum(f0) / RATE
            src = sum(np.sin(2 * np.pi * h * ph) / h for h in range(1, 18))
            voiced = formant(src, v1 * fscale, 0.14) + 0.6 * formant(src, v2 * fscale, 0.12)
            amp = np.sin(np.pi * np.clip(sx / dur, 0, 1)) ** 0.7
            onset = band(noise(0.012), 1800, 5000) * env(0.012, 0.001, 0.004)
            syl = voiced / (np.max(np.abs(voiced)) or 1) * amp
            syl[: len(onset)] += 0.25 * onset
            i = int(RATE * at) % n
            end = i + len(syl)
            if end <= n:
                out[i:end] += syl * 0.8
            else:
                out[i:] += syl[: n - i] * 0.8
                out[: end - n] += syl[n - i :] * 0.8
            at += dur + 0.02 + 0.05 * rng.random()
    out = band(out, 120, 2600)  # muffled, as heard through a wall
    return normalize(out, 0.5)


# --- Finishing: click-free edges and a loudness target per class ----------------------------------

# Target RMS (dBFS) over the audible part of a sound, by class. The cues' own `volume` then tunes
# sounds relative to each other. See docs/audio.md.
LEVELS = {
    "ui": -26.0,  # click, hover, back, copy, pings
    "fx": -22.0,  # gameplay feedback: steps, rustle, place, ticks, keys, bells
    "heavy": -19.0,  # stamp, buzzer, alarms, stingers, events
    "ambshot": -24.0,  # distant one-shots (phone, printer, fax, typing); cues play them at ~0.3
    "amb": -34.0,  # the room tone and chatter beds (quiet by design)
}
CLASS_OF = {
    **{k: "ui" for k in ("click", "hover", "back", "copy", "ping1", "ping2", "ping3", "slide", "deskopen")},
    **{k: "heavy" for k in ("start", "stamp", "buzzer", "alarm", "lowsting", "lastsec", "win", "lose", "fanfare", "evviral", "evboss", "evraid", "evoutage", "evcorrection", "evclear", "evback")},
    **{k: "ambshot" for k in ("ambphone", "ambprinter", "ambfax", "ambtyping", "evzap")},
    **{k: "amb" for k in ("roomtone", "ambchatter")},
}
PEAK_CEILING = 0.9
LOOPS = {"roomtone", "keys", "ambchatter"}


def finish(name, signal):
    """Fades (loops excepted), loudness target by class, soft peak ceiling."""
    s = signal.astype(np.float64)
    if name in LOOPS:
        s = s - np.mean(s)
    else:
        fi, fo = int(RATE * 0.0015), int(RATE * 0.008)
        s[:fi] *= np.linspace(0, 1, fi)
        s[-fo:] *= np.linspace(1, 0, fo)
    peak = float(np.max(np.abs(s))) or 1.0
    active = s[np.abs(s) > 0.05 * peak]
    rms = float(np.sqrt(np.mean(active**2))) or 1.0
    s = s / rms * 10 ** (LEVELS[CLASS_OF.get(name, "fx")] / 20)
    if float(np.max(np.abs(s))) > PEAK_CEILING:
        # Sparse transients exceed the ceiling first: round them with a soft knee, not a clip.
        k = PEAK_CEILING * 0.75
        over = np.abs(s) > k
        s[over] = np.sign(s[over]) * (k + (PEAK_CEILING - k) * np.tanh((np.abs(s[over]) - k) / (PEAK_CEILING - k)))
    return s


SOUNDS = [
    ("click", click, False),
    ("hover", hover, False),
    ("back", back, False),
    ("copy", copy_ding, False),
    ("join", join_chime, False),
    ("leave", leave_chime, False),
    ("step1", lambda: step(1), False),
    ("step2", lambda: step(2), False),
    ("start", desk_bell, False),
    ("stamp", stamp_thud, False),
    ("roomtone", roomtone, True),
    ("arrive", arrive_bell, False),
    ("rustle", paper_rustle, False),
    ("place", paper_place, False),
    ("warn", warn_ticks, False),
    ("tick", clock_tick, False),
    ("buzzer", expiry_buzzer, False),
    ("keys", typewriter_loop, True),
    ("slide", minigame_slide, False),
    ("fail", fail_buzz, False),
    ("deskopen", desk_open, False),
    ("chime", correct_chime, False),
    ("fanfare", context_fanfare, False),
    ("hmm", wrong_hmm, False),
    ("alarm", alarm_sting, False),
    ("lowsting", low_sting, False),
    ("lastsec", last_seconds, False),
    ("win", win_stinger, False),
    ("lose", lose_stinger, False),
    ("ping1", lambda: ping_bell(1175), False),
    ("ping2", lambda: ping_bell(880), False),
    ("ping3", lambda: ping_bell(1480), False),
    # S3-07 ambience. Appended last: the RNG is shared, so earlier sounds stay identical.
    ("ambphone", amb_phone, False),
    ("ambprinter", amb_printer, False),
    ("ambfax", amb_fax, False),
    ("ambtyping", amb_typing, False),
    # S4-05 level events. Appended last for the same reason.
    ("evviral", ev_viral, False),
    ("evboss", ev_boss, False),
    ("evraid", ev_raid, False),
    ("evoutage", ev_outage, False),
    ("evcorrection", ev_correction, False),
    ("evclear", ev_clear, False),
    ("evback", ev_back, False),
    ("evzap", ev_zap, False),
    # S5-08 final pass. Appended last; the ids above never change meaning.
    ("ambchatter", amb_chatter, True),
]


def main():
    OUT_AUDIO.mkdir(parents=True, exist_ok=True)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    parts = []
    sprite = {}
    cursor = 0.0
    for name, fn, loop in SOUNDS:
        s = finish(name, fn())
        sprite[name] = [round(cursor * 1000), round(len(s) / RATE * 1000), loop]
        parts.append(s)
        gap = np.zeros(int(RATE * GAP_S))
        parts.append(gap)
        cursor += len(s) / RATE + GAP_S
    audio = np.concatenate(parts)
    pcm = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "sfx.wav"
        with wave.open(str(wav_path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(pcm.tobytes())
        for ext, args in (("webm", ["-ar", "48000", "-c:a", "libopus", "-b:a", "28k", "-vbr", "constrained"]), ("mp3", ["-ar", "32000", "-c:a", "libmp3lame", "-b:a", "32k"])):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", *args, str(OUT_AUDIO / f"sfx.{ext}")],
                check=True,
            )
    # One line per sound, as Biome formats it (so `bun run format` leaves the file alone).
    lines = [f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in sprite.items()]
    OUT_JSON.write_text("{\n" + ",\n".join(lines) + "\n}\n")
    print(f"wrote {len(sprite)} sounds, {cursor:.1f} s", file=sys.stderr)


if __name__ == "__main__":
    main()
