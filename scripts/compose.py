"""배경 합성 — 만든 화면 영상(out/viewer-4k.mp4)을 노트북 · 모니터 · 편집기 화면 안에 넣어 세로 릴스로.

바탕은 각자 준비합니다(직접 찍은 책상 사진 · 영상, 또는 그림 AI 로 만든 바탕). 바탕 속 화면의 네 귀퉁이 좌표만 알려 주면 됩니다.
바탕이 없으면 --demo 로 어두운 기본 바탕(모니터 한 대)을 그려서 합성합니다.

쓰는 법(키트 폴더에서):
  python scripts/compose.py --demo --seconds 5                                   # 기본 바탕으로 5초만 시험 → out/composed.mp4
  python scripts/compose.py --bg desk.jpg --quad "312,880 1130,840 1150,1330 300,1360"
  python scripts/compose.py --bg desk.mp4 --quad "..." --size 1440x2560          # 바탕 영상은 끝나면 처음부터 다시
  python scripts/compose.py --demo --still 12.5                                  # 한 장만 그려 보기 → out/composed_12.5.png

--quad = 바탕 그림 픽셀 좌표 네 점 「왼위 오른위 오른아래 왼아래」(그림판 · 포토샵에서 마우스를 올리면 보이는 숫자)
품질: 화면 영상을 먼저 넓이 평균으로 줄이고(계단 X) → 2배 크기로 비틀어 → 다시 넓이 평균으로 줄임(깜빡임 X) → 아주 약한 샤픈.
필요한 것: Python 3.10+ · numpy · opencv-python · ffmpeg(PATH 에)
"""
import argparse
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
IMG_EXT = ('.jpg', '.jpeg', '.png', '.webp', '.bmp')


def demo_bg(w, h):
    """어두운 방 + 모니터 한 대(테두리 · 받침 · 그림자) — 네 귀퉁이도 같이 돌려줌"""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = 1 - np.sqrt(((xx - w * 0.5) / w) ** 2 + ((yy - h * 0.42) / h) ** 2) * 1.6
    g = np.clip(g, 0, 1)[..., None]
    bg = (np.array([24, 20, 18], np.float32) + g * np.array([70, 58, 52], np.float32))       # BGR · 따뜻한 어둠
    bg = bg.astype(np.uint8)
    mw, mh = int(w * 0.92), int(w * 0.92 * 9 / 16)
    x0, y0 = (w - mw) // 2, int(h * 0.30)
    quad = np.float32([[x0 + 18, y0 + 14], [x0 + mw - 18, y0 + 4], [x0 + mw - 10, y0 + mh - 2], [x0 + 10, y0 + mh + 10]])
    sh = np.zeros((h, w), np.float32)
    cv2.fillConvexPoly(sh, (quad + [0, 40]).astype(np.int32), 1.0)
    sh = cv2.GaussianBlur(sh, (0, 0), w * 0.03)[..., None]
    bg = (bg * (1 - 0.6 * sh)).astype(np.uint8)
    bez = np.float32([[-26, -26], [26, -26], [26, 30], [-26, 30]]) + quad
    cv2.fillConvexPoly(bg, bez.astype(np.int32), (14, 14, 16), lineType=cv2.LINE_AA)
    cx = int((quad[2][0] + quad[3][0]) / 2)
    cv2.rectangle(bg, (cx - 40, int(quad[2][1]) + 30), (cx + 40, int(quad[2][1]) + 230), (20, 20, 22), -1)
    cv2.ellipse(bg, (cx, int(quad[2][1]) + 236), (230, 26), 0, 0, 360, (26, 26, 28), -1, lineType=cv2.LINE_AA)
    return bg, quad


class Reader:
    """영상(앞으로만 읽기 · 끝나면 처음부터) 또는 그림 한 장"""

    def __init__(self, path, loop=False):
        self.still = None
        if Path(path).suffix.lower() in IMG_EXT:
            self.still = cv2.imread(str(path), cv2.IMREAD_COLOR)
            if self.still is None:
                sys.exit(f'cannot read image: {path}')
            return
        self.cap = cv2.VideoCapture(str(path))
        if not self.cap.isOpened():
            sys.exit(f'cannot open video: {path}')
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 60
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.loop, self.i, self.f = loop, -1, None

    def get(self, idx):
        if self.still is not None:
            return self.still
        if self.loop and self.n:
            idx %= self.n
        if idx < self.i or idx > self.i + 30:
            self.cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            self.i = idx - 1
        while self.i < idx:
            ok, f = self.cap.read()
            if not ok:
                break
            self.f, self.i = f, self.i + 1
        return self.f


def place(bg, screen, quad, ss=2, sharpen=0.4):
    """screen 을 bg 의 quad 안에 넣기(BGR uint8 → uint8)"""
    H, W = bg.shape[:2]
    qw = max(np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3]))
    tw = int(min(screen.shape[1], max(64, qw * ss)))                     # 화면 영상을 먼저 넓이 평균으로 줄임
    th = int(round(tw * screen.shape[0] / screen.shape[1]))
    src = cv2.resize(screen, (tw, th), interpolation=cv2.INTER_AREA) if tw < screen.shape[1] else screen
    src = np.dstack([src.astype(np.float32) / 255.0, np.ones(src.shape[:2], np.float32)])
    x0, y0 = max(0, int(np.floor(quad[:, 0].min())) - 2), max(0, int(np.floor(quad[:, 1].min())) - 2)
    x1, y1 = min(W, int(np.ceil(quad[:, 0].max())) + 2), min(H, int(np.ceil(quad[:, 1].max())) + 2)
    M = cv2.getPerspectiveTransform(np.float32([[0, 0], [tw, 0], [tw, th], [0, th]]), np.float32((quad - [x0, y0]) * ss))
    big = cv2.warpPerspective(src, M, ((x1 - x0) * ss, (y1 - y0) * ss), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    sm = cv2.resize(np.clip(big, 0, 1), (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    a = sm[..., 3:4]
    rgb = sm[..., :3]
    if sharpen > 0:
        bl = cv2.GaussianBlur(rgb, (0, 0), 0.7)
        rgb = np.clip(rgb + np.clip((rgb - bl) * sharpen, -0.04, 0.04) * (a > 0.999), 0, 1)
    out = bg.astype(np.float32) / 255.0
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - a) + rgb   # 이미 알파가 곱해진 색
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description='put a screen video inside a background (laptop / monitor / editor)')
    ap.add_argument('--screen', default=str(ROOT / 'out' / 'viewer-4k.mp4'))
    ap.add_argument('--bg', default='', help='background image or video')
    ap.add_argument('--quad', default='', help='"x,y x,y x,y x,y" = top-left top-right bottom-right bottom-left in background pixels')
    ap.add_argument('--demo', action='store_true', help='draw a simple dark background with one monitor')
    ap.add_argument('--size', default='1440x2560', help='output size for --demo, or resize background to this')
    ap.add_argument('--fps', type=float, default=60)
    ap.add_argument('--seconds', type=float, default=0, help='only the first N seconds (quick test)')
    ap.add_argument('--start', type=float, default=0, help='start at this second of the screen video')
    ap.add_argument('--still', default='', help='draw one frame at this second -> png')
    ap.add_argument('--ss', type=int, default=2)
    ap.add_argument('--crf', type=int, default=14)
    ap.add_argument('--out', default=str(ROOT / 'out' / 'composed.mp4'))
    a = ap.parse_args()

    W, H = (int(v) for v in a.size.lower().split('x'))
    if a.demo:
        bg_still, quad = demo_bg(W, H)
        bgr = None
    else:
        if not a.bg or not a.quad:
            sys.exit('need --bg and --quad (or --demo)')
        bgr = Reader(a.bg, loop=True)
        first = bgr.get(0)
        quad = np.float32([[float(v) for v in p.split(',')] for p in a.quad.split()])
        if quad.shape != (4, 2):
            sys.exit('--quad needs 4 points')
        if first.shape[1] != W or first.shape[0] != H:
            sx, sy = W / first.shape[1], H / first.shape[0]
            quad = np.float32(quad * [sx, sy])
    scr = Reader(a.screen)

    def bg_at(i):
        if bgr is None:
            return bg_still
        f = bgr.get(i)
        return f if (f.shape[1], f.shape[0]) == (W, H) else cv2.resize(f, (W, H), interpolation=cv2.INTER_AREA)

    s0 = int(round(a.start * a.fps))
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    if a.still:
        i = int(round(float(a.still) * a.fps))
        p = out.with_name(f'{out.stem}_{a.still}.png')
        cv2.imwrite(str(p), place(bg_at(i), scr.get(i), quad, a.ss))
        print('still ->', p)
        return
    n = scr.n - s0 if scr.still is None else int(a.fps * 5)
    if a.seconds:
        n = min(n, int(round(a.seconds * a.fps)))
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
                           '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-g', '120',
                           '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE)
    for k in range(n):
        f = scr.get(s0 + k)
        if f is None:
            break
        ff.stdin.write(place(bg_at(k), f, quad, a.ss).tobytes())
        if k % 120 == 0:
            print(f'{k}/{n}', flush=True)
    ff.stdin.close()
    ff.wait()
    print('done ->', out)


if __name__ == '__main__':
    main()
