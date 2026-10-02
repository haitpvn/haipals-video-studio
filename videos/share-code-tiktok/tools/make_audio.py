"""Synthesise the music bed and extra SFX for the share-code TikTok.

Everything is generated in code (no samples, no licences):
  public/audio/music.wav      ~39s upbeat/dramatic bed, 128 BPM, A minor
  public/sfx/whoosh.wav       filtered noise sweep for scene cuts
  public/sfx/buzz.wav         two-tone error buzzer
  public/sfx/kaching.wav      cash-register bell + coins
"""
import os
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter

SR = 44100
ROOT = os.path.join(os.path.dirname(__file__), "..", "public")
rng = np.random.default_rng(7)


def t_axis(sec):
    return np.arange(int(sec * SR)) / SR


def env(n, a=0.005, d=0.2):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e


def lp(x, cut):
    b, a = butter(2, cut / (SR / 2), "low")
    return lfilter(b, a, x)


def hp(x, cut):
    b, a = butter(2, cut / (SR / 2), "high")
    return lfilter(b, a, x)


def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
    return lfilter(b, a, x)


def save(path, x, peak=0.9):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    wavfile.write(path, SR, (x * 32767).astype(np.int16))


def note(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


# ── drums ──
def kick():
    t = t_axis(0.45)
    f = 50 + 120 * np.exp(-t / 0.04)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * env(len(t), 0.001, 0.18) * 1.0


def clap():
    t = t_axis(0.3)
    n = rng.standard_normal(len(t))
    e = np.zeros(len(t))
    for off in (0, 0.012, 0.024):
        i = int(off * SR)
        e[i:] += env(len(t) - i, 0.001, 0.05 if off < 0.02 else 0.14)
    return bp(n, 900, 3500) * e * 0.8


def hat(open_=False):
    t = t_axis(0.25 if open_ else 0.06)
    n = rng.standard_normal(len(t))
    return hp(n, 7000) * env(len(t), 0.001, 0.08 if open_ else 0.018) * 0.35


def saw(freq, sec, detune=0.0):
    t = t_axis(sec)
    out = np.zeros(len(t))
    for d in (-detune, 0, detune):
        out += 2 * ((t * freq * (1 + d)) % 1) - 1
    return out / 3


def music(total=39.0, bpm=128):
    beat = 60 / bpm
    n = int(total * SR)
    mix = np.zeros(n)
    bass = np.zeros(n)
    pad = np.zeros(n)

    def add(buf, x, at):
        i = int(at * SR)
        j = min(n, i + len(x))
        if i < n:
            buf[i:j] += x[: j - i]

    # A minor: Am – F – C – G, one bar each
    prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
    bars = int(total / (beat * 4)) + 1
    intro_bars = 1  # sparse first bar: riser + kick only, so the hook lands hard
    for b in range(bars):
        root, chord = prog[b % 4]
        bar_t = b * 4 * beat
        for k in range(4):
            add(mix, kick(), bar_t + k * beat)
        if b >= intro_bars:
            for k in (1, 3):
                add(mix, clap(), bar_t + k * beat)
            for k in range(8):
                add(mix, hat(open_=(k % 2 == 1)), bar_t + k * beat / 2)
            # off-beat pumping bass
            for k in range(8):
                if k % 2 == 1:
                    s = saw(note(root - 12), beat / 2 * 0.9, 0.004)
                    s = lp(s, 900) * env(len(s), 0.004, 0.16)
                    add(bass, s, bar_t + k * beat / 2)
        # dramatic chord stabs on beat 1 and the "and" of 2
        for at in (0, 1.5 * beat):
            stab = sum(saw(note(m), beat * 0.8, 0.006) for m in chord)
            stab = lp(stab, 2600) * env(len(stab), 0.003, 0.22)
            add(pad, stab * (0.55 if b >= intro_bars else 0.35), bar_t + at)

    # sidechain-ish duck on every beat
    t = np.arange(n) / SR
    duck = 1 - 0.55 * np.exp(-((t % beat) / 0.09))
    out = mix * 0.9 + bass * 0.75 * duck + pad * 0.45 * duck
    # fade out last 1.2s
    fade = np.clip((total - t) / 1.2, 0, 1)
    return out * fade


def whoosh():
    t = t_axis(0.45)
    n = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    seg = 512
    for i in range(0, len(t), seg):
        frac = i / len(t)
        lo = 300 + 3500 * frac
        out[i : i + seg] = bp(n[i : i + seg + 0], lo, lo * 2.2)[: len(out[i : i + seg])]
    shape = np.sin(np.pi * np.clip(t / t[-1], 0, 1)) ** 2
    return out * shape


def buzz():
    t = t_axis(0.55)
    sq = np.sign(np.sin(2 * np.pi * 140 * t)) * 0.6 + np.sign(np.sin(2 * np.pi * 147 * t)) * 0.4
    gate = ((t < 0.22) | ((t > 0.28) & (t < 0.5))).astype(float)
    return lp(sq, 2400) * gate * env(len(t), 0.002, 1.0)


def kaching():
    t = t_axis(1.1)
    bell = np.zeros(len(t))
    for f, a in ((2093, 1.0), (2637, 0.6), (3136, 0.45), (4186, 0.25)):
        bell += a * np.sin(2 * np.pi * f * t)
    i0 = int(0.09 * SR)
    ding = np.zeros(len(t))
    ding[i0:] = bell[: len(t) - i0] * env(len(t) - i0, 0.002, 0.35)
    clink = hp(rng.standard_normal(len(t)), 4000) * env(len(t), 0.001, 0.03) * 0.6
    coins = np.zeros(len(t))
    for k in range(6):
        j = int((0.25 + 0.05 * k) * SR)
        c = np.sin(2 * np.pi * (3500 + 300 * k) * t[: int(0.06 * SR)]) * env(int(0.06 * SR), 0.001, 0.02)
        coins[j : j + len(c)] += c * 0.35
    return ding + clink + coins


if __name__ == "__main__":
    save(os.path.join(ROOT, "audio", "music.wav"), music(), 0.8)
    save(os.path.join(ROOT, "sfx", "whoosh.wav"), whoosh(), 0.7)
    save(os.path.join(ROOT, "sfx", "buzz.wav"), buzz(), 0.6)
    save(os.path.join(ROOT, "sfx", "kaching.wav"), kaching(), 0.7)
    print("ok")
