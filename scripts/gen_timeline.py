"""장면 표 짜기 — 30초를 0.5초 박으로 나눠 장면 · 「조각이 붙는 시각」(= 효과음 시각) 한 벌 → src/timeline.json

이 표 하나를 그림(src/Viewer.tsx)과 소리(scripts/mix_sfx.py)가 같이 읽습니다. 그래서 그림과 소리가 어긋나지 않아요.
박 = 0.5초(120 BPM) · 모든 시각은 1/60초(한 장)로 반올림

쓰는 법:  python scripts/gen_timeline.py
바꾸는 곳: 아래 SC 표(장면 id · 시작 · 끝 · 조각 수 · 조각이 붙는 몫 · 꼴). id 는 Viewer.tsx 의 renderScene 과 같아야 합니다.
"""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
R = random.Random(1112)          # 같은 씨앗 = 늘 같은 표(다시 돌려도 소리 · 그림이 그대로)
T = 30.08                        # 전체 길이(초)


def fr(x):
    return round(round(x * 60) / 60, 4)


# (id, 시작, 끝, 조각 수, 조각이 붙는 몫(장면 앞부분 비율), 꼴)
SC = [
    ('badge', 0.0, 1.0, 9, 0.75, 'pop'),
    ('cubes', 1.0, 2.0, 6, 0.6, 'burst'),
    ('word', 2.0, 3.0, 6, 0.55, 'type'),
    ('brand', 3.0, 4.0, 12, 0.6, 'type'),
    ('grid', 4.0, 5.5, 9, 0.7, 'grid'),
    ('sorted', 5.5, 6.5, 3, 0.45, 'drop'),
    ('blocks', 6.5, 8.0, 18, 0.75, 'stack'),
    ('counter', 8.0, 9.0, 8, 0.8, 'count'),
    ('fan', 9.0, 10.5, 8, 0.65, 'fan'),
    ('name', 10.5, 11.5, 2, 0.4, 'type'),
    ('line', 11.5, 12.5, 21, 0.8, 'typewriter'),
    ('bars', 12.5, 14.0, 24, 0.7, 'rise'),
    ('placed', 14.0, 15.0, 3, 0.45, 'drop'),
    ('domino', 15.0, 17.0, 20, 0.85, 'chain'),
    ('found', 17.0, 18.5, 12, 0.7, 'grid'),
    ('editor', 18.5, 20.0, 15, 0.75, 'fill'),
    ('chart', 20.0, 21.0, 9, 0.7, 'rise'),
    ('mosaic', 21.0, 22.5, 24, 0.75, 'tile'),
    ('again', 22.5, 23.5, 14, 0.8, 'typewriter'),
    ('logo', 23.5, 25.5, 11, 0.6, 'outline'),
    ('end', 25.5, T, 6, 0.35, 'end'),
]


def build():
    out = {'T': T, 'beat': 0.5, 'scenes': []}
    for sid, a, b, n, share, kind in SC:
        span = (b - a) * share
        if kind in ('type', 'typewriter', 'chain', 'stack', 'rise', 'tile', 'fill', 'outline', 'grid', 'count', 'fan', 'pop'):
            base = [a + 0.04 + span * k / max(1, n) for k in range(n)]
            times = [fr(x + R.uniform(-0.012, 0.012)) for x in base]
        else:  # burst · drop · end = 박에 붙임
            times = [fr(a + 0.04 + span * k / max(1, n - 1)) if n > 1 else fr(a + 0.04) for k in range(n)]
        # 장면 머리 = 「타타탁」 세 조각이 바로 붙음(빈 화면 없이 시작)
        if len(times) >= 4 and kind not in ('type', 'drop', 'end', 'pop'):
            times[0], times[1], times[2] = fr(a + 0.0), fr(a + 0.05), fr(a + 0.1)
        if a == 0:
            times[0] = 0.0  # 첫 장부터 그림이 있게
        times = sorted(max(a, min(b - 0.02, t)) for t in times)
        out['scenes'].append({'id': sid, 'start': a, 'end': b, 'kind': kind, 'pieces': times})
    return out


if __name__ == '__main__':
    out = build()
    (ROOT / 'src').mkdir(exist_ok=True)
    p = ROOT / 'src' / 'timeline.json'
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1)
    n = sum(len(s['pieces']) for s in out['scenes'])
    print(f'scenes {len(SC)}, pieces {n} -> {p.relative_to(ROOT)}')
