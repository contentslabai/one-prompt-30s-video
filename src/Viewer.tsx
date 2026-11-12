// Kinetic 30s Starter — 30초 · 60fps · 4K 「타다닥」 키네틱 타이포 영상
// 흰 바탕 · 쨍한 색 · 0.5~2초마다 장면이 바뀌고, 장면 안 그림은 src/timeline.json 의 「조각 시각」마다 하나씩 붙어 완성됩니다.
// 조각 시각 = 효과음 시각(scripts/mix_sfx.py 가 같은 표로 소리를 붙입니다) → 그림과 소리가 늘 같이 갑니다.
// 글자 = DOM(1920 판을 2배로 키움 → 4K 에서도 계단 없음) · 3D = three.js(@remotion/three, 4K 캔버스 그대로).
//
// ▶ 내 영상으로 바꿀 곳 = 바로 아래 TEXT 한 칸뿐(글자만 바꿔도 다른 영상이 됩니다).
//   장면 순서 · 길이 · 조각 수는 scripts/gen_timeline.py 에서 바꾸고 다시 돌리세요.
import React, {useEffect, useMemo, useState} from 'react';
import {AbsoluteFill, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import * as THREE from 'three';
import TL from './timeline.json';

// ───────────── 여기만 바꾸세요
export const TEXT = {
  agents: 'AGENTS',                  // 0초 배지 아래 글자
  build: 'build it.',                // 1초 큐브 폭발 위 글자
  word: 'Claude',                    // 2초 큰 글자
  brand: 'Your Brand',               // 3초 큰 글자(밑줄)
  roles: ['plan', 'script', 'design', 'motion', 'sound', 'color', 'edit', 'QA', 'post'],  // 4초 카드 9장
  sorted: ['Every', 'cut,', 'sorted.'],
  counterUnit: 'frames',
  fanTitle: '30 seconds',
  star: 'YOUR NAME',                 // 10.5초 큰 글자
  starSub: 'starring',
  line: 'one idea. one line.',       // 11.5초 타자기
  placed: ['Every', 'sound,', 'placed.'],
  busy: ['Busywork', 'runs itself'],
  found: 'found',
  editorCards: ['timeline', 'color', 'sound'],
  chart: ['×9', 'agents at once'],
  mosaic: 'DONE',
  again: 'make it again.',
  logo: 'yourbrand',                 // 23.5초 무지개 테두리 안 글자
  endBrand: 'Your Brand',            // 끝 장면
  endLine: 'Made by AI agents.',
  endButton: 'Follow for more',
};

export const FPS = 60;
export const W4 = 3840, H4 = 2160;
export const FRAMES = Math.round((TL as any).T * FPS);
const W = 1920, H = 1080;

type Sc = {id: string; start: number; end: number; kind: string; pieces: number[]};
const SCENES = (TL as any).scenes as Sc[];

const BG = '#F6F5F0', INK = '#111111';
const C = {lime: '#C9F530', pink: '#FF3D8B', blue: '#2D5BFF', orange: '#FF7A1A', purple: '#8B5CFF', yellow: '#FFD23F', green: '#19D37A', red: '#FF4B2B', cyan: '#18C8F0'};
const RAINBOW = [C.red, C.orange, C.yellow, C.lime, C.green, C.cyan, C.blue, C.purple, C.pink];
// 글꼴: public/fonts/ 에 넣으면 그 글꼴, 없으면 컴퓨터 기본 굵은 글꼴로 그립니다(README 「글꼴」).
const EN = 'PoppinsB, "Arial Black", "Segoe UI", sans-serif', ENS = 'PoppinsS, "Segoe UI", Arial, sans-serif', KR = 'Gmarket, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
// 톡 튀는 크기(넘쳤다 제자리) — 조각이 붙는 순간의 맛
const popS = (dt: number, d = 0.24) => (dt < 0 ? 0 : dt >= d ? 1 : easeOut(dt / d) * (1 + 0.22 * Math.sin(clamp(dt / d) * Math.PI)));
const nOn = (sc: Sc, t: number) => sc.pieces.filter((p) => p <= t).length;
const age = (sc: Sc, k: number, t: number) => t - (sc.pieces[k] ?? 1e9);
const rnd = (i: number) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ───────────── 글꼴 기다리기(파일이 없어도 멈추지 않음)
const useFonts = () => {
  const [h] = useState(() => delayRender('fonts'));
  useEffect(() => {
    const fs = [
      new FontFace('PoppinsB', `url(${staticFile('fonts/Poppins-Bold.ttf')})`),
      new FontFace('PoppinsS', `url(${staticFile('fonts/Poppins-SemiBold.ttf')})`),
      new FontFace('Gmarket', `url(${staticFile('fonts/GmarketSansTTFBold.ttf')})`),
    ];
    Promise.allSettled(fs.map((f) => f.load())).then((rs) => {
      rs.forEach((r) => { if (r.status === 'fulfilled') (document as any).fonts.add(r.value); });
      continueRender(h);
    });
  }, [h]);
};

// ───────────── 장면들 (DOM · 1920 판 좌표)
const Center: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div style={{position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...style}}>{children}</div>
);

const Badge: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const n = nOn(sc, t);
  const s = popS(t - sc.pieces[0] + 0.3, 0.3);
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{transform: `scale(${s * (1 + lt * 0.05)}) rotate(${-8 + lt * 6}deg)`, width: 520, height: 520, borderRadius: 140,
        background: `linear-gradient(145deg, #FF6FB0, ${C.pink} 45%, #E0167A)`, boxShadow: '0 60px 120px rgba(255,61,139,.35), inset 0 -18px 40px rgba(0,0,0,.18), inset 0 18px 40px rgba(255,255,255,.35)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white'}}>
        <div style={{fontFamily: EN, fontSize: 250, lineHeight: 1, transform: `scale(${popS(age(sc, Math.max(0, n - 1), t), 0.12) || 1})`}}>{Math.max(1, n)}</div>
        <div style={{fontFamily: EN, fontSize: 64, letterSpacing: 6, marginTop: 6}}>{TEXT.agents}</div>
      </div>
      {[...Array(10)].map((_, i) => {
        const a = (i / 10) * Math.PI * 2 + lt * 0.9, r = 380 + 40 * Math.sin(lt * 3 + i);
        const sz = 34 + 26 * rnd(i);
        return <div key={i} style={{position: 'absolute', left: W / 2 + Math.cos(a) * r - sz / 2, top: H / 2 + Math.sin(a) * r * 0.8 - sz / 2, width: sz, height: sz,
          borderRadius: i % 2 ? sz / 2 : 10, background: RAINBOW[i % 9], opacity: clamp((t - sc.pieces[Math.min(8, i)]) * 8), transform: `scale(${popS(t - sc.pieces[Math.min(8, i)])})`}} />;
      })}
    </Center>
  );
};

const Word: React.FC<{sc: Sc; t: number; text: string; color?: string; size?: number; font?: string; sub?: string; underline?: string}> = ({sc, t, text, color = INK, size = 300, font = EN, sub, underline}) => {
  const ch = [...text];
  const per = sc.pieces.length;
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{transform: `scale(${1 + lt * 0.04})`, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
        {sub && <div style={{fontFamily: ENS, fontSize: 74, color: '#555', marginBottom: 6, opacity: clamp(lt * 6)}}>{sub}</div>}
        <div style={{display: 'flex', fontFamily: font, fontSize: size, color, letterSpacing: -size * 0.04, lineHeight: 1.05}}>
          {ch.map((c, i) => {
            const k = Math.min(per - 1, Math.floor((i / ch.length) * per));
            const dt = age(sc, k, t) - (i - Math.floor((k / per) * ch.length)) * 0.018;
            const s = popS(dt, 0.2);
            return <span key={i} style={{display: 'inline-block', whiteSpace: 'pre', transform: `translateY(${(1 - s) * 60}px) scale(${s})`, opacity: s > 0 ? 1 : 0}}>{c}</span>;
          })}
        </div>
        {underline && <div style={{height: 26, borderRadius: 13, background: underline, marginTop: 18, width: `${easeOut((t - sc.pieces[per - 1]) / 0.3) * 100}%`}} />}
      </div>
    </Center>
  );
};

const Grid9: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{transform: `perspective(1800px) rotateX(${18 - lt * 6}deg) rotateZ(${-6 + lt * 3}deg) scale(${0.95 + lt * 0.05})`, display: 'grid', gridTemplateColumns: 'repeat(3, 300px)', gap: 30}}>
        {TEXT.roles.slice(0, 9).map((r, i) => {
          const s = popS(age(sc, i, t), 0.22);
          const on = s > 0;
          return <div key={i} style={{width: 300, height: 200, borderRadius: 40, background: on ? RAINBOW[(i * 4) % 9] : '#E6E4DD', transform: `scale(${on ? s : 0.92})`,
            boxShadow: on ? '0 30px 60px rgba(0,0,0,.16)' : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
            <div style={{fontFamily: EN, fontSize: 70, color: on ? INK : 'transparent'}}>{r}</div>
            <div style={{fontFamily: ENS, fontSize: 32, color: on ? 'rgba(0,0,0,.6)' : 'transparent'}}>agent {String(i + 1).padStart(2, '0')}</div>
          </div>;
        })}
      </div>
    </Center>
  );
};

const Drop: React.FC<{sc: Sc; t: number; words: string[]; accent: string}> = ({sc, t, words, accent}) => {
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{textAlign: 'center', transform: `scale(${1 + lt * 0.05})`}}>
        <div style={{display: 'flex', gap: 40, justifyContent: 'center', fontFamily: EN, fontSize: 170, letterSpacing: -6, color: INK}}>
          {words.map((w, i) => {
            const dt = age(sc, i, t);
            const y = dt < 0 ? -900 : (1 - easeOut(dt / 0.25)) * -500 + Math.sin(clamp(dt / 0.3) * Math.PI) * 20;
            const last = i === words.length - 1;
            return <span key={i} style={{display: 'inline-block', transform: `translateY(${y}px) rotate(${(1 - easeOut(dt / 0.3)) * (i % 2 ? 12 : -12)}deg)`}}>
              {last ? <>{w.slice(0, -1)}<span style={{color: accent}}>{w.slice(-1)}</span></> : w}</span>;
          })}
        </div>
      </div>
    </Center>
  );
};

const Counter: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  const v = Math.round(FRAMES * easeInOut(clamp(lt / 0.8)));
  const n = nOn(sc, t);
  return (
    <Center>
      <div style={{background: 'white', borderRadius: 120, padding: '60px 120px', boxShadow: '0 40px 100px rgba(0,0,0,.12)', display: 'flex', alignItems: 'baseline', gap: 36,
        transform: `scale(${popS(lt, 0.25)})`}}>
        <span style={{fontFamily: EN, fontSize: 230, color: INK, fontVariantNumeric: 'tabular-nums', letterSpacing: -6}}>{v.toLocaleString('en-US')}</span>
        <span style={{fontFamily: ENS, fontSize: 80, color: '#888'}}>{TEXT.counterUnit}</span>
      </div>
      {[...Array(n)].map((_, i) => <div key={i} style={{position: 'absolute', left: 200 + i * 200, top: 140 + (i % 2) * 760, width: 110, height: 110, borderRadius: 30,
        background: RAINBOW[i % 9], transform: `scale(${popS(age(sc, i, t))}) rotate(${i * 25 + lt * 60}deg)`}} />)}
    </Center>
  );
};

// 카드 부채(그림 파일 없이 색 카드 · 내 장면 그림을 쓰려면 public/img/ 에 넣고 <Img src={staticFile(...)}/> 로)
const Fan: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  return (
    <AbsoluteFill style={{perspective: 2400}}>
      {[...Array(8)].map((_, i) => {
        const dt = age(sc, i, t);
        if (dt < 0) return null;
        const e = easeOut(dt / 0.35);
        const ang = (i - 3.5) * 9, x = (i - 3.5) * 150;
        const c1 = RAINBOW[i % 9], c2 = RAINBOW[(i + 3) % 9];
        return <div key={i} style={{position: 'absolute', left: W / 2 - 230, top: H / 2 - 160, width: 460, height: 260, borderRadius: 26, overflow: 'hidden',
          boxShadow: '0 40px 80px rgba(0,0,0,.25)', border: '10px solid white', background: `linear-gradient(135deg, ${c1}, ${c2})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: EN, fontSize: 120, color: 'rgba(255,255,255,.9)',
          transform: `translate(${x * e}px, ${(1 - e) * 900 + Math.abs(i - 3.5) * 22}px) rotateZ(${ang * e}deg) rotateY(${(1 - e) * 60 + Math.sin(lt * 2 + i) * 6}deg)`}}>
          {String(i + 1).padStart(2, '0')}
        </div>;
      })}
      <div style={{position: 'absolute', left: 0, right: 0, top: 120, textAlign: 'center', fontFamily: EN, fontSize: 120, color: INK, opacity: clamp((lt - 0.6) * 6), transform: `scale(${popS(lt - 0.6)})`}}>{TEXT.fanTitle}</div>
    </AbsoluteFill>
  );
};

const Typewriter: React.FC<{sc: Sc; t: number; text: string; color?: string; size?: number; hi?: [number, number, string]}> = ({sc, t, text, color = INK, size = 190, hi}) => {
  const n = nOn(sc, t);
  const shown = Math.round((n / sc.pieces.length) * text.length);
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{fontFamily: EN, fontSize: size, color, letterSpacing: -6, transform: `scale(${1 + lt * 0.04})`, whiteSpace: 'pre'}}>
        {[...text].map((c, i) => <span key={i} style={{opacity: i < shown ? 1 : 0, color: hi && i >= hi[0] && i < hi[1] ? hi[2] : undefined}}>{c}</span>)}
        <span style={{display: 'inline-block', width: 16, height: size * 0.9, marginLeft: 8, background: C.blue, verticalAlign: 'middle', opacity: Math.floor(t * 4) % 2 ? 1 : 0.15}} />
      </div>
    </Center>
  );
};

const Found: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const n = nOn(sc, t);
  const lt = t - sc.start;
  const cols = 8, rows = 4;
  const last = sc.pieces.length;
  return (
    <AbsoluteFill style={{background: `radial-gradient(circle at 30% 30%, #E4FF7A, ${C.lime} 70%)`}}>
      <div style={{position: 'absolute', left: 260, top: 210, display: 'grid', gridTemplateColumns: `repeat(${cols}, 160px)`, gap: 14,
        transform: `perspective(2000px) rotateX(${30 - lt * 10}deg) rotateZ(${-8 + lt * 4}deg)`}}>
        {[...Array(cols * rows)].map((_, i) => {
          const k = Math.floor((i / (cols * rows)) * last);
          const on = age(sc, k, t) >= 0;
          const target = i === 13;
          return <div key={i} style={{width: 160, height: 110, borderRadius: 18, background: target && n >= last ? C.blue : on ? 'white' : 'rgba(255,255,255,.35)',
            boxShadow: on ? '0 10px 24px rgba(0,0,0,.08)' : 'none', transform: `scale(${target && n >= last ? popS(age(sc, last - 1, t), 0.3) * 1.08 : on ? 1 : 0.94})`}} />;
        })}
      </div>
      <div style={{position: 'absolute', right: 160, bottom: 140, fontFamily: EN, fontSize: 190, color: INK, letterSpacing: -6, opacity: n >= last ? 1 : 0, transform: `scale(${popS(age(sc, last - 1, t) - 0.1)})`}}>
        {TEXT.found}<span style={{color: C.blue}}>.</span></div>
    </AbsoluteFill>
  );
};

const Editor: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  const cols = [C.orange, C.pink, C.green];
  return (
    <AbsoluteFill style={{perspective: 2600, background: `linear-gradient(135deg, ${C.blue} 0%, ${C.purple} 100%)`}}>
      {TEXT.editorCards.slice(0, 3).map((label, j) => (
        <div key={j} style={{position: 'absolute', left: 230 + j * 520 - lt * 120, top: 230 + j * 40, width: 560, height: 620, borderRadius: 44, background: 'white',
          boxShadow: '0 50px 100px rgba(0,0,0,.14)', transform: `rotateY(${-26 + lt * 8}deg) rotateX(${8}deg)`, padding: 40, boxSizing: 'border-box'}}>
          <div style={{fontFamily: EN, fontSize: 56, color: INK}}>{label}</div>
          {[...Array(5)].map((_, r) => {
            const k = j * 5 + r;
            const s = clamp(age(sc, k, t) / 0.2);
            return <div key={r} style={{height: 58, marginTop: 28, borderRadius: 18, background: '#EFEDE6', overflow: 'hidden'}}>
              <div style={{height: '100%', width: `${s * (45 + 50 * rnd(k))}%`, borderRadius: 18, background: r % 2 ? cols[j] : RAINBOW[(k * 2) % 9]}} />
            </div>;
          })}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// 타일 모자이크(그림 파일 없이 색 그라데이션 · 내 그림을 쓰려면 backgroundImage 를 url(staticFile('img/내그림.jpg')) 로)
const MOSAIC_BG = `radial-gradient(circle at 25% 30%, ${C.yellow}, transparent 45%), radial-gradient(circle at 75% 65%, ${C.cyan}, transparent 50%), linear-gradient(120deg, ${C.pink}, ${C.purple} 55%, ${C.blue})`;
const Mosaic: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const cols = 8, rows = 5, N = cols * rows;
  const lt = t - sc.start;
  const tw = 1600 / cols, th = 900 / rows;
  const order = useMemo(() => [...Array(N)].map((_, i) => i).sort((a, b) => rnd(a + 7) - rnd(b + 7)), [N]);
  return (
    <AbsoluteFill>
      <div style={{position: 'absolute', left: 160, top: 90, width: 1600, height: 900, transform: `scale(${1 + lt * 0.03})`}}>
        {order.map((tile, rank) => {
          const k = Math.min(sc.pieces.length - 1, Math.floor((rank / N) * sc.pieces.length));
          const dt = age(sc, k, t);
          if (dt < 0) return null;
          const e = easeOut(dt / 0.22);
          const cx = tile % cols, cy = Math.floor(tile / cols);
          return <div key={tile} style={{position: 'absolute', left: cx * tw, top: cy * th, width: tw + 1, height: th + 1,
            backgroundImage: MOSAIC_BG, backgroundSize: '1600px 900px', backgroundPosition: `-${cx * tw}px -${cy * th}px`,
            transform: `translateY(${(1 - e) * -120}px) scale(${0.6 + 0.4 * e}) rotate(${(1 - e) * (rnd(tile) * 40 - 20)}deg)`, opacity: e, borderRadius: (1 - e) * 20}} />;
        })}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 70, textAlign: 'center', fontFamily: EN, fontSize: 210, color: 'white',
        textShadow: '0 10px 40px rgba(0,0,0,.45)', opacity: clamp((lt - 0.95) * 8), transform: `scale(${popS(lt - 0.95)})`}}>{TEXT.mosaic}</div>
    </AbsoluteFill>
  );
};

const Logo: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const n = nOn(sc, t);
  const lt = t - sc.start;
  const txt = TEXT.logo;
  return (
    <Center>
      <div style={{position: 'relative', transform: `scale(${0.9 + lt * 0.06}) rotate(${-3 + lt * 1.5}deg)`}}>
        {[...Array(9)].map((_, i) => {
          const on = i < n;
          const pad = (9 - i) * 17;
          return <div key={i} style={{position: 'absolute', left: -pad, right: -pad, top: -pad, bottom: -pad, borderRadius: 80 + pad, border: `15px solid ${RAINBOW[i]}`,
            opacity: on ? 1 : 0, transform: `scale(${on ? popS(age(sc, i, t), 0.18) : 0.9})`}} />;
        })}
        <div style={{position: 'relative', background: 'white', borderRadius: 80, padding: '50px 110px', fontFamily: EN, fontSize: 200, letterSpacing: -8, color: INK}}>
          {[...txt].map((c, i) => <span key={i} style={{opacity: n >= 10 || lt > 0.9 ? 1 : clamp((lt - 0.5 - i * 0.03) * 10)}}>{c}</span>)}
        </div>
      </div>
    </Center>
  );
};

// 끝 장면: 둥근 네모 로고(재생 표시) + 브랜드 이름 + 한 줄 + 단추 — 조각 6개 = 로고 · 재생 · 거품 둘 · 한 줄 · 단추
const End: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  return (
    <Center>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${1 + lt * 0.012})`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 50}}>
          <svg viewBox="0 0 512 512" width={250} height={250} style={{overflow: 'visible'}}>
            <g style={{transformOrigin: '256px 256px', transform: `scale(${popS(age(sc, 0, t), 0.25)})`}}>
              <rect x={56} y={56} width={400} height={400} rx={110} fill={INK} />
            </g>
            <g style={{transformOrigin: '270px 256px', transform: `scale(${popS(age(sc, 1, t), 0.25)})`}}>
              <path fill={C.lime} stroke={C.lime} strokeWidth={28} strokeLinejoin="round" d="M214 180L340 256L214 332Z" />
            </g>
            {[2, 3].map((k, j) => {const a = Math.max(0, age(sc, k, t)); const r = (j ? 20 : 28) * popS(age(sc, k, t), 0.25);
              return <circle key={k} cx={j ? 430 : 470} cy={(j ? 30 : 0) + 20 - Math.min(a, 4) * 14} r={r} fill={j ? C.pink : C.yellow} />;})}
          </svg>
          <div style={{fontFamily: EN, fontSize: 190, letterSpacing: -8, color: INK, opacity: clamp(age(sc, 3, t) * 6)}}>{TEXT.endBrand}</div>
        </div>
        <div style={{fontFamily: ENS, fontSize: 66, color: '#555', marginTop: 40, opacity: clamp(age(sc, 4, t) * 5)}}>{TEXT.endLine}</div>
        <div style={{marginTop: 50, background: INK, color: 'white', fontFamily: EN, fontSize: 52, padding: '26px 64px', borderRadius: 60, transform: `scale(${popS(age(sc, 5, t), 0.25)})`}}>
          {TEXT.endButton}</div>
      </div>
    </Center>
  );
};

// ───────────── three.js 장면 (4K 캔버스)
const Light = () => (<><ambientLight intensity={1.15} /><directionalLight position={[4, 6, 8]} intensity={2.2} /><directionalLight position={[-6, -2, 4]} intensity={0.6} /></>);

const Cubes3D: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const items = useMemo(() => [...Array(420)].map((_, i) => ({g: i % sc.pieces.length, dir: new THREE.Vector3(rnd(i) - 0.5, rnd(i + 1) - 0.5, rnd(i + 2) - 0.5).normalize(),
    sp: 3 + rnd(i + 3) * 7, rot: rnd(i + 4) * 10, s: 0.12 + rnd(i + 5) * 0.22, c: RAINBOW[i % 9]})), [sc.pieces.length]);
  return (
    <ThreeCanvas width={W4} height={H4} camera={{fov: 40, position: [0, 0, 10]}} gl={{antialias: true, alpha: true}}>
      <Light />
      {items.map((it, i) => {
        const dt = t - sc.pieces[it.g];
        if (dt < 0) return null;
        const d = it.sp * (1 - Math.exp(-dt * 3.2));
        const p = it.dir.clone().multiplyScalar(d);
        p.y -= dt * dt * 1.2;
        return <mesh key={i} position={[p.x * 1.6, p.y, p.z]} rotation={[dt * it.rot, dt * it.rot * 0.7, 0]} scale={it.s * popS(dt, 0.12)}>
          <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={it.c} roughness={0.35} metalness={0.05} /></mesh>;
      })}
    </ThreeCanvas>
  );
};

const Blocks3D: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  return (
    <ThreeCanvas width={W4} height={H4} camera={{fov: 35, position: [0, 3.2, 11]}} gl={{antialias: true, alpha: true}}>
      <Light />
      <group rotation={[0.32, -0.45 + lt * 0.25, 0]}>
        {sc.pieces.map((p, i) => {
          const dt = t - p;
          if (dt < 0) return null;
          const row = i % 6, col = Math.floor(i / 6);
          const len = 1.4 + rnd(i) * 1.6;
          const x = -4 + col * 2.9 + rnd(i + 9) * 0.6, y = 2.2 - row * 0.75;
          const fall = (1 - easeOut(dt / 0.25)) * 4;
          return <mesh key={i} position={[x, y + fall, 0]} scale={[len, 0.5, 0.9]}>
            <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={RAINBOW[(i * 5) % 9]} roughness={0.3} /></mesh>;
        })}
      </group>
    </ThreeCanvas>
  );
};

const Bars3D: React.FC<{sc: Sc; t: number; n?: number}> = ({sc, t, n}) => {
  const lt = t - sc.start;
  const N = n ?? sc.pieces.length;
  return (
    <ThreeCanvas width={W4} height={H4} camera={{fov: 35, position: [0, 2.5, 12]}} gl={{antialias: true, alpha: true}}>
      <Light />
      <group rotation={[0.25, -0.35 + lt * 0.3, 0]} position={[0, -1.6, 0]}>
        <mesh position={[0, -0.06, 0]} scale={[n ? 10.5 : 11.5, 0.12, 3.2]}><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={'#FFFFFF'} roughness={0.6} /></mesh>
        {[...Array(N)].map((_, i) => {
          const k = Math.min(sc.pieces.length - 1, Math.floor((i / N) * sc.pieces.length));
          const dt = t - sc.pieces[k];
          const full = 0.6 + (n ? (i + 1) * 0.55 : 1.5 + 2.2 * Math.abs(Math.sin(i * 0.7 + t * 4)));
          const hgt = dt < 0 ? 0.35 : 0.35 + (full - 0.35) * easeOut(dt / 0.25);
          const x = (i - (N - 1) / 2) * (n ? 0.95 : 0.42);
          return <mesh key={i} position={[x, hgt / 2, 0]} scale={[n ? 0.72 : 0.3, hgt, n ? 0.72 : 0.3]}>
            <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={RAINBOW[i % 9]} roughness={0.3} /></mesh>;
        })}
      </group>
    </ThreeCanvas>
  );
};

const Domino3D: React.FC<{sc: Sc; t: number}> = ({sc, t}) => {
  const lt = t - sc.start;
  const per = 34;
  return (
    <ThreeCanvas width={W4} height={H4} camera={{fov: 36, position: [0, 6.2, 8.2]}} gl={{antialias: true, alpha: true}}>
      <Light />
      <group rotation={[0, lt * 0.35, 0]} position={[0, -0.5, 0]}>
        {sc.pieces.map((p, g) => [...Array(per)].map((_, j) => {
          const i = g * per + j;
          const dt = t - p - j * 0.012;
          if (dt < 0) return null;
          const u = i / (sc.pieces.length * per);
          const a = u * Math.PI * 4.4;
          const r = 1.6 + u * 4.6;
          const lane = (j % 3) - 1;
          const x = Math.cos(a) * (r + lane * 0.36), z = Math.sin(a) * (r + lane * 0.36) * 0.72;
          return <mesh key={i} position={[x, 0.5 * popS(dt, 0.15), z]} rotation={[0, -a, 0]} scale={[0.2, 1.0 * popS(dt, 0.15), 0.3]}>
            <boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color={u < 0.18 ? C.green : RAINBOW[(i * 7) % 9]} roughness={0.3} /></mesh>;
        }))}
      </group>
    </ThreeCanvas>
  );
};

// ───────────── 본편: 장면 id → 그림 (timeline.json 의 id 와 같아야 합니다)
const renderScene = (sc: Sc, t: number): {dom: React.ReactNode; three: React.ReactNode} => {
  let dom: React.ReactNode = null, three: React.ReactNode = null;
  switch (sc.id) {
    case 'badge': dom = <Badge sc={sc} t={t} />; break;
    case 'cubes': three = <Cubes3D sc={sc} t={t} />; dom = <Center><div style={{fontFamily: EN, fontSize: 120, color: INK, opacity: clamp((t - sc.start - 0.35) * 5)}}>{TEXT.build}</div></Center>; break;
    case 'word': dom = <Word sc={sc} t={t} text={TEXT.word} size={330} />; break;
    case 'brand': dom = <Word sc={sc} t={t} text={TEXT.brand} size={250} sub="+" underline={C.lime} />; break;
    case 'grid': dom = <Grid9 sc={sc} t={t} />; break;
    case 'sorted': dom = <Drop sc={sc} t={t} words={TEXT.sorted} accent={C.pink} />; break;
    case 'blocks': three = <Blocks3D sc={sc} t={t} />; break;
    case 'counter': dom = <Counter sc={sc} t={t} />; break;
    case 'fan': dom = <Fan sc={sc} t={t} />; break;
    case 'name': dom = <Word sc={sc} t={t} text={TEXT.star} size={300} font={KR} color={C.pink} sub={TEXT.starSub} />; break;
    case 'line': dom = <Typewriter sc={sc} t={t} text={TEXT.line} size={150} hi={[9, TEXT.line.length, C.blue]} />; break;
    case 'bars': three = <Bars3D sc={sc} t={t} />; break;
    case 'placed': dom = <Drop sc={sc} t={t} words={TEXT.placed} accent={C.green} />; break;
    case 'domino': three = <Domino3D sc={sc} t={t} />; dom = <div style={{position: 'absolute', left: 120, top: 90, fontFamily: EN, fontSize: 150, color: INK, letterSpacing: -5}}>
      <div style={{fontFamily: ENS, fontSize: 64, color: '#666'}}>{TEXT.busy[0]}</div>{TEXT.busy[1]}<span style={{color: C.green}}>.</span></div>; break;
    case 'found': dom = <Found sc={sc} t={t} />; break;
    case 'editor': dom = <Editor sc={sc} t={t} />; break;
    case 'chart': three = <Bars3D sc={sc} t={t} n={9} />; dom = <div style={{position: 'absolute', right: 150, top: 120, fontFamily: EN, fontSize: 260, color: INK, letterSpacing: -8,
      transform: `scale(${0.85 + 0.15 * popS(t - sc.pieces[sc.pieces.length - 1])})`}}>{TEXT.chart[0]}<div style={{fontFamily: ENS, fontSize: 60, color: '#666', letterSpacing: 0}}>{TEXT.chart[1]}</div></div>; break;
    case 'mosaic': dom = <Mosaic sc={sc} t={t} />; break;
    case 'again': dom = <Typewriter sc={sc} t={t} text={TEXT.again} hi={[8, TEXT.again.length, C.orange]} />; break;
    case 'logo': dom = <Logo sc={sc} t={t} />; break;
    default: dom = <End sc={sc} t={t} />;
  }
  return {dom, three};
};

// 늘 떠 있는 작은 색 조각(화면이 비지 않게 · 가운데는 비워 둠)
const Confetti: React.FC<{t: number}> = ({t}) => (
  <>{[...Array(26)].map((_, i) => {
    const x = (rnd(i) * 1.1 - 0.05) * W, y = (rnd(i + 50) * 1.1 - 0.05) * H;
    const sz = 14 + rnd(i + 9) * 26;
    const edge = Math.min(x, W - x, y, H - y);
    if (edge > 260 && !(x < 300 || x > W - 300)) return null;
    return <div key={i} style={{position: 'absolute', left: x + Math.sin(t * 0.8 + i) * 18, top: y + Math.cos(t * 0.7 + i) * 18, width: sz, height: sz,
      borderRadius: i % 3 === 0 ? sz / 2 : 6, background: RAINBOW[i % 9], opacity: 0.85, transform: `rotate(${t * 40 + i * 30}deg)`}} />;
  })}</>
);

export const KineticViewer: React.FC = () => {
  useFonts();
  const f = useCurrentFrame();
  const t = f / FPS;
  const sc = SCENES.find((s) => t >= s.start && t < s.end) ?? SCENES[SCENES.length - 1];
  const idx = SCENES.indexOf(sc);
  const cur = renderScene(sc, t);
  const lt = t - sc.start;
  const XF = 0.22;  // 다음 장면 머리에서 앞 장면 끝 모습을 0.22초 겹쳐 밀어냄(빈 화면 없이 이어짐)
  const prev = idx > 0 && lt < XF ? renderScene(SCENES[idx - 1], SCENES[idx - 1].end - 1 / FPS) : null;
  const k = clamp(lt / XF);
  return (
    <AbsoluteFill style={{background: BG}}>
      <AbsoluteFill style={{background: `radial-gradient(ellipse at ${50 + 20 * Math.sin(t * 0.4)}% ${40 + 10 * Math.cos(t * 0.3)}%, #FFFFFF 0%, ${BG} 55%, #ECEAE2 100%)`}} />
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: 'scale(2)', transformOrigin: '0 0'}}><Confetti t={t} /></div>
      {prev && <AbsoluteFill style={{opacity: 1 - easeInOut(k), transform: `scale(${1 + 0.18 * easeInOut(k)})`}}>
        {prev.three && <AbsoluteFill>{prev.three}</AbsoluteFill>}
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: 'scale(2)', transformOrigin: '0 0'}}>{prev.dom}</div></AbsoluteFill>}
      <AbsoluteFill style={{opacity: prev ? easeOut(k * 1.4) : 1, transform: prev ? `scale(${0.92 + 0.08 * easeOut(k)})` : undefined}}>
        {cur.three && <AbsoluteFill>{cur.three}</AbsoluteFill>}
        <div style={{position: 'absolute', left: 0, top: 0, width: W, height: H, transform: 'scale(2)', transformOrigin: '0 0'}}>{cur.dom}</div></AbsoluteFill>
    </AbsoluteFill>
  );
};
