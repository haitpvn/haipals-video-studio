"""Fit the composition to the recorded voice-over.

1. Cuts the raw recording (public/vo/raw.m4a) into its seven scene lines,
   drops the long gaps, cleans it up and writes public/vo/voiceover.wav.
2. Re-times the composition: every animation time and SFX start goes through a
   piecewise-linear map (old silent-cut time -> new voice-led time), anchored on
   the words each beat belongs to. Scene clip windows are rewritten to match.

Timings come from silence detection + a Vietnamese Whisper pass on the take
(New_Recording_2.m4a). Re-run after editing ANCHORS or SEGMENTS.
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
RAW = os.path.join(ROOT, "public", "vo", "raw.m4a")
OUT = os.path.join(ROOT, "public", "vo", "voiceover.wav")
INDEX = os.path.join(ROOT, "index.html")
TOTAL = 41.2

# (raw start, raw end, new start) — one per scene line
SEGMENTS = [
    (0.00, 1.90, 0.10),    # (Mất mười) lăm bảng chỉ vì một cú click sai
    (2.94, 8.10, 2.55),    # Lỗi một … chọn Anything else
    (9.17, 13.32, 8.40),   # Lỗi hai … hết hạn trước ngày hẹn
    (14.26, 19.28, 13.25), # Lỗi ba … trước khi lấy code
    (20.87, 26.20, 18.95), # Hậu quả … Get It Right
    (29.31, 40.75, 24.95), # Làm đúng chỉ 4 bước … in ra
    (42.24, 46.10, 36.80), # Comment CODE … check hồ sơ cho bạn
]

# old (silent cut) time -> new (voice-led) time
ANCHORS = [
    (0.0, 0.0), (3.0, 2.35),
    (4.2, 3.36), (6.0, 4.78), (6.8, 6.81),         # click Work / cut / click Anything else
    (9.0, 8.20), (11.5, 10.61),                     # expired-gap cut on "hết hạn"
    (14.0, 13.05), (15.5, 15.29), (16.5, 16.28),    # old-passport X / new passport on "cập nhật"
    (19.0, 18.75), (20.3, 20.08), (21.4, 22.08), (22.6, 24.08),  # warn / receipt on "mất thêm 15 bảng" / stamp
    (24.0, 24.75), (24.5, 26.40),                   # typing starts on "Google …"
    (26.5, 29.69), (29.0, 31.84), (31.5, 33.34),    # steps 2-4 on "đăng nhập" / "chọn" / "kiểm tra"
    (32.3, 33.50), (32.8, 35.05), (33.3, 35.85),    # ticks on "hết hạn" / "tải PDF" / "in ra"
    (34.0, 36.60), (35.1, 37.83),                   # CTA pill on "Haipals Travel"
    (38.0, TOTAL),
]

SCENES = {"s1": (0, 3), "s2": (3, 9), "s3": (9, 14), "s4": (14, 19), "s5": (19, 24), "s6": (24, 34), "s7": (34, 38)}


def remap(t):
    for (o0, n0), (o1, n1) in zip(ANCHORS, ANCHORS[1:]):
        if o0 <= t <= o1:
            return n0 + (t - o0) * (n1 - n0) / (o1 - o0)
    return TOTAL


def build_voice():
    parts, labels = [], []
    for i, (a, b, at) in enumerate(SEGMENTS):
        parts.append(
            f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.06:.3f}:d=0.06,"
            f"adelay={int(at * 1000)}|{int(at * 1000)}[s{i}]"
        )
        labels.append(f"[s{i}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"amix=inputs={len(SEGMENTS)}:normalize=0,"
    graph += "highpass=f=80,afftdn=nf=-30,acompressor=threshold=-20dB:ratio=3:attack=5:release=80,"
    graph += f"loudnorm=I=-16:TP=-1.5:LRA=9,apad,atrim=0:{TOTAL}[out]"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", RAW, "-filter_complex", graph, "-map", "[out]",
                    "-ar", "48000", "-ac", "2", OUT], check=True)


def retime_html():
    s = open(INDEX, encoding="utf-8").read()
    if "/* voice-over remap */" in s:
        raise SystemExit("index.html already retimed — restore it from git before re-running")
    # scene clip windows
    for sid, (o0, o1) in SCENES.items():
        n0, n1 = remap(o0), remap(o1)
        s = re.sub(rf'(<div id="{sid}" class="scene clip" )data-start="[0-9.]+" data-duration="[0-9.]+"',
                   rf'\1data-start="{n0:.2f}" data-duration="{n1 - n0:.2f}"', s)
    # SFX starts
    s = re.sub(r'(<audio id="sfx-[^"]+" src="[^"]+" )data-start="([0-9.]+)"',
               lambda m: f'{m.group(1)}data-start="{remap(float(m.group(2))):.2f}"', s)
    # root, music, voice-over
    s = s.replace('data-duration="38" data-width="1080"', f'data-duration="{TOTAL}" data-width="1080"')
    s = s.replace('<audio id="music" src="public/audio/music.wav" data-start="0" data-duration="38" data-track-index="10" data-volume="0.38"></audio>',
                  f'<audio id="music" src="public/audio/music.wav" data-start="0" data-duration="{TOTAL}" data-track-index="10" data-volume="0.16"></audio>\n'
                  f'      <audio id="voiceover" src="public/vo/voiceover.wav" data-start="0" data-duration="{TOTAL}" data-track-index="9" data-volume="1"></audio>')
    s = re.sub(r'data-volume="0\.(\d+)"></audio>', lambda m: m.group(0) if m.group(1) in ("16",) else
               f'data-volume="{float("0." + m.group(1)) * 0.7:.2f}"></audio>', s)
    # every timeline position already goes through q(); route it through the remap
    js_map = "const ANCHORS = " + json.dumps(ANCHORS) + ";\n" + \
        "        const remap = (t) => { for (let i = 0; i < ANCHORS.length - 1; i++) { const [o0, n0] = ANCHORS[i], [o1, n1] = ANCHORS[i + 1]; if (t >= o0 && t <= o1) return n0 + ((t - o0) * (n1 - n0)) / (o1 - o0); } return " + str(TOTAL) + "; };\n"
    s = s.replace("const q = (t) => Math.round(t * FPS) / FPS;",
                  "/* voice-over remap */\n        " + js_map + "        const q = (t) => Math.round(remap(t) * FPS) / FPS;")
    # scene 6 bob and CTA sway should cover the longer windows
    s = s.replace('bob("#s6-cat", 24.8, 9.0);', 'bob("#s6-cat", 24.8, 11.5);')
    s = s.replace('{ rotation: 4, duration: 0.35, yoyo: true, repeat: 8,', '{ rotation: 4, duration: 0.35, yoyo: true, repeat: 11,')
    s = s.replace('{ rotation: 50, duration: 4, ease: "none" }, q(34));', '{ rotation: 50, duration: 4.6, ease: "none" }, q(34));')
    s = s.replace('{ rotation: 0 }, { rotation: 40, duration: 3, ease: "none" }, 0);', '{ rotation: 0 }, { rotation: 30, duration: 2.4, ease: "none" }, 0);')
    open(INDEX, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    build_voice()
    retime_html()
    for sid, (o0, o1) in SCENES.items():
        print(sid, f"{remap(o0):.2f} -> {remap(o1):.2f}")
