"""Fit the composition to the ElevenLabs "Nguyễn Khoái" voice-over.

Starts from the silent composition (tools/index.silent.html), routes every
timeline position and SFX start through a word-anchored time map, and adds the
voice track. Anchors come from pause detection on public/vo/khoai.mp3
(the voice plays from t=0, unedited).
"""
import json
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
BASE = os.path.join(HERE, "index.silent.html")
INDEX = os.path.join(ROOT, "index.html")
RAW = os.path.join(ROOT, "public", "vo", "khoai.mp3")
OUT = os.path.join(ROOT, "public", "vo", "voiceover.wav")
TOTAL = 36.6

# old (silent cut) time -> new (voice-led) time
ANCHORS = [
    (0.0, 0.0), (0.4, 0.2), (0.9, 1.35), (1.45, 2.0),          # MẤT £15 / "chỉ vì" / "click"
    (3.0, 2.75), (4.2, 4.2), (6.0, 5.43), (6.8, 6.75),          # Lỗi 1: click Work / "Xin visa" / "Anything else"
    (9.0, 7.75), (9.6, 8.68), (11.5, 10.3),                     # Lỗi 2: "lấy code" / "hết hạn"
    (14.0, 11.4), (15.5, 13.3), (16.5, 14.04),                  # Lỗi 3: "cũ" / "cập nhật"
    (19.0, 15.9), (20.3, 17.16), (21.4, 19.25), (22.6, 21.4),   # Hậu quả: warn / "mất thêm" / "Get It Right"
    (24.0, 22.3), (24.5, 24.03),                                # 4 bước / "Google …"
    (26.5, 26.6), (29.0, 28.6), (31.5, 29.85),                  # "Đăng nhập" / "Chọn" / "Kiểm tra"
    (32.3, 30.2), (32.8, 31.45), (33.3, 32.1),                  # ticks: hết hạn / tải PDF / in ra
    (34.0, 32.85), (35.1, 34.0),                                # CTA: "Comment CODE" / "Haipals Travel"
    (38.0, TOTAL),
]
SCENES = {"s1": (0, 3), "s2": (3, 9), "s3": (9, 14), "s4": (14, 19), "s5": (19, 24), "s6": (24, 34), "s7": (34, 38)}


def remap(t):
    for (o0, n0), (o1, n1) in zip(ANCHORS, ANCHORS[1:]):
        if o0 <= t <= o1:
            return n0 + (t - o0) * (n1 - n0) / (o1 - o0)
    return TOTAL


def build_voice():
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", RAW, "-af",
                    f"highpass=f=70,loudnorm=I=-15:TP=-1.5:LRA=9,apad,atrim=0:{TOTAL}",
                    "-ar", "48000", "-ac", "2", OUT], check=True)


def retime_html():
    s = open(BASE, encoding="utf-8").read()
    for sid, (o0, o1) in SCENES.items():
        n0, n1 = remap(o0), remap(o1)
        s = re.sub(rf'(<div id="{sid}" class="scene clip" )data-start="[0-9.]+" data-duration="[0-9.]+"',
                   rf'\1data-start="{n0:.2f}" data-duration="{n1 - n0:.2f}"', s)
    s = re.sub(r'(<audio id="sfx-[^"]+" src="[^"]+" )data-start="([0-9.]+)" data-duration="([0-9.]+)" data-track-index="(\d+)" data-volume="([0-9.]+)"',
               lambda m: f'{m.group(1)}data-start="{remap(float(m.group(2))):.2f}" data-duration="{m.group(3)}" '
                         f'data-track-index="{m.group(4)}" data-volume="{float(m.group(5)) * 0.5:.2f}"', s)
    s = s.replace('data-duration="38" data-width="1080"', f'data-duration="{TOTAL}" data-width="1080"')
    s = s.replace('<audio id="music" src="public/audio/music.wav" data-start="0" data-duration="38" data-track-index="10" data-volume="0.38"></audio>',
                  f'<audio id="music" src="public/audio/music.wav" data-start="0" data-duration="{TOTAL}" data-track-index="10" data-volume="0.12"></audio>\n'
                  f'      <audio id="voiceover" src="public/vo/voiceover.wav" data-start="0" data-duration="{TOTAL}" data-track-index="9" data-volume="1"></audio>')
    js_map = "const ANCHORS = " + json.dumps(ANCHORS) + ";\n" + \
        "        const remap = (t) => { for (let i = 0; i < ANCHORS.length - 1; i++) { const [o0, n0] = ANCHORS[i], [o1, n1] = ANCHORS[i + 1]; if (t >= o0 && t <= o1) return n0 + ((t - o0) * (n1 - n0)) / (o1 - o0); } return " + str(TOTAL) + "; };\n"
    s = s.replace("const q = (t) => Math.round(t * FPS) / FPS;",
                  "/* voice-over remap */\n        " + js_map + "        const q = (t) => Math.round(remap(t) * FPS) / FPS;")
    s = s.replace('{ rotation: 0 }, { rotation: 40, duration: 3, ease: "none" }, 0);', '{ rotation: 0 }, { rotation: 30, duration: 2.75, ease: "none" }, 0);')
    open(INDEX, "w", encoding="utf-8").write(s)


if __name__ == "__main__":
    build_voice()
    retime_html()
    for sid, (o0, o1) in SCENES.items():
        print(sid, f"{remap(o0):.2f} -> {remap(o1):.2f}")
