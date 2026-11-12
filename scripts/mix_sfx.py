"""소리 박자 맞추기 — src/timeline.json 의 「조각 시각」마다 효과음을 하나씩 붙이고, 음악(있으면)을 깔고, -14 LUFS 로 맞춥니다.

그림이 붙는 시각과 소리 시각이 같은 표에서 나오니 「타다닥」이 화면과 딱 맞습니다.

쓰는 법(키트 폴더에서):
  python scripts/mix_sfx.py                                  # 효과음 = 이 스크립트가 만든 기본 클릭 · 음악 없음 → out/mix.wav
  python scripts/mix_sfx.py --sfx sfx --music music.mp3      # sfx/ 폴더의 내 효과음(wav · mp3) + 내 음악
  python scripts/mix_sfx.py --video out/viewer-4k.mp4        # 섞은 소리를 영상에 얹어 out/final.mp4 까지

효과음 고르기: sfx/ 폴더에 파일을 넣으면 이름 순서대로 — 첫 파일 = 장면 첫 조각(조금 센 소리) · 나머지 = 그 밖의 조각(돌아가며).
필요한 것: Python 3.10+ · numpy · ffmpeg(PATH 에)
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SR = 48000


def load(p):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(p), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True)
    if r.returncode != 0:
        sys.exit(f'ffmpeg could not read: {p}')
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy()


def hit(x, dur):
    """효과음 파일에서 소리가 시작하는 곳부터 dur 초만 잘라 앞뒤를 부드럽게"""
    env = np.abs(x).mean(1)
    i0 = int(np.argmax(env > env.max() * 0.2))
    seg = x[max(0, i0 - 48):max(0, i0 - 48) + int(dur * SR)].copy()
    k = min(96, len(seg))
    seg[:k] *= np.linspace(0, 1, k)[:, None]
    tail = len(seg) // 3
    if tail:
        seg[-tail:] *= np.linspace(1, 0, tail)[:, None]
    return seg / (np.abs(seg).max() + 1e-9)


def synth_click(seed, dur=0.07, tone=2400.0, strong=False):
    """기본 클릭(파일이 없을 때): 짧은 잡음 + 높은 음 · 빠르게 사라짐"""
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * (55 if strong else 80))
    x = (rng.standard_normal(n) * 0.55 + np.sin(2 * np.pi * tone * t) * 0.6) * env
    if strong:
        x += np.sin(2 * np.pi * 180 * t) * np.exp(-t * 30) * 0.9   # 첫 조각 = 아래 「툭」
    x[:48] *= np.linspace(0, 1, 48)
    x = x / (np.abs(x).max() + 1e-9)
    return np.stack([x, x], 1).astype(np.float32)


def fit(x, n):
    return x[:n] if len(x) >= n else np.vstack([x, np.zeros((n - len(x), 2), np.float32)])


def save(x, p):
    p.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s16le', str(p)],
                   input=np.clip(x, -1, 1).astype(np.float32).tobytes(), check=True)


def measure(p):
    """통합 소리 크기(LUFS) 재기 — ffmpeg ebur128"""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(p), '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], capture_output=True, text=True, errors='replace')
    vals = [ln.split()[1] for ln in r.stderr.splitlines() if ln.strip().startswith('I:') and 'LUFS' in ln]
    try:
        return float(vals[-1])
    except (IndexError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description='timeline.json -> SFX mix (-14 LUFS)')
    ap.add_argument('--timeline', default=str(ROOT / 'src' / 'timeline.json'))
    ap.add_argument('--sfx', default='', help='folder of your own sound effects (wav/mp3). empty = built-in clicks')
    ap.add_argument('--music', default='', help='your own music file (optional)')
    ap.add_argument('--sfx-db', type=float, default=-4.0)
    ap.add_argument('--music-db', type=float, default=-8.0)
    ap.add_argument('--fade', type=float, default=1.1, help='fade-out seconds at the end')
    ap.add_argument('--lufs', type=float, default=-14.0)
    ap.add_argument('--out', default=str(ROOT / 'out' / 'mix.wav'))
    ap.add_argument('--video', default='', help='put the mix on this video -> --final')
    ap.add_argument('--final', default=str(ROOT / 'out' / 'final.mp4'))
    a = ap.parse_args()

    tl = json.load(open(a.timeline, encoding='utf-8'))
    T = float(tl['T'])
    N = int(round(T * SR))

    if a.sfx:
        files = sorted(p for p in Path(a.sfx).iterdir() if p.suffix.lower() in ('.wav', '.mp3', '.m4a', '.aif', '.aiff', '.flac'))
        if not files:
            sys.exit(f'no sound files in {a.sfx}')
        first = hit(load(files[0]), 0.09)
        rest = [hit(load(p), 0.08) for p in (files[1:] or files)]
    else:
        first = synth_click(1, 0.09, 1800, strong=True)
        rest = [synth_click(2 + i, 0.06 + 0.01 * i, 2200 + 500 * i) for i in range(3)]

    pieces = np.zeros((N, 2), np.float32)
    rng = np.random.default_rng(1112)
    count = 0
    for sc in tl['scenes']:
        for k, t in enumerate(sc['pieces']):
            s = first if k == 0 else rest[int(rng.integers(len(rest)))]
            g = rng.uniform(0.8, 1.0)
            pan = rng.uniform(-0.3, 0.3)
            i = int(t * SR)
            if i >= N:
                continue
            seg = s[:min(len(s), N - i)] * g * np.array([1 - max(0, pan), 1 + min(0, pan)], np.float32)
            pieces[i:i + len(seg)] += seg
            count += 1

    db = lambda d: 10 ** (d / 20)
    mix = pieces * db(a.sfx_db)
    if a.music:
        mix = mix + fit(load(a.music), N) * db(a.music_db)
    if a.fade > 0:
        fo = np.clip((T - np.arange(N) / SR) / a.fade, 0, 1).astype(np.float32) ** 1.3
        mix *= fo[:, None]

    out = Path(a.out)
    raw = out.with_name(out.stem + '_raw.wav')
    save(mix, raw)
    # 마지막 소리 크기 = -14 LUFS(인스타 · 유튜브 기준 · ±0.3) · 꼭대기 약 -2 dB(표본 기준)
    # 클릭은 뾰족해서 loudnorm 만으로는 -14 까지 못 올라감 → 리미터로 꼭대기를 먼저 누르고 → 재 보고 모자란 만큼 한 번 더
    tmp = out.with_name(out.stem + '_ln.wav')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', f'alimiter=limit=0.35:attack=1:release=40:level=disabled,loudnorm=I={a.lufs}:TP=-1:LRA=11',
                    '-ar', str(SR), '-c:a', 'pcm_s16le', str(tmp)], check=True)
    src, gain = tmp, 0.0
    for _ in range(4):                       # 모자란 만큼 올리고 꼭대기(-1.9 dB)만 누름 → 0.3 LU 안이면 끝
        got = measure(src)
        if got is None or abs(a.lufs - got) <= 0.3:
            break
        gain += a.lufs - got
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(tmp), '-af', f'volume={gain:.2f}dB,alimiter=limit=0.8:attack=0.1:release=40:level=disabled:asc=1',
                        '-ar', str(SR), '-c:a', 'pcm_s16le', str(out)], check=True)
        src = out
    if src == tmp:
        tmp.replace(out)
    tmp.unlink(missing_ok=True)
    final = measure(out)
    print(f'sfx {count} hits, music {"yes" if a.music else "no"}, loudness {final if final is not None else "?"} LUFS -> {out}')

    if a.video:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', a.video, '-i', str(out), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
                        '-shortest', '-movflags', '+faststart', a.final], check=True)
        print(f'video + mix -> {a.final}')


if __name__ == '__main__':
    main()
