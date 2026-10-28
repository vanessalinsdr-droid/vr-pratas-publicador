import React, {useState} from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
  delayRender,
  continueRender,
} from 'remotion';
import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import '@fontsource/cinzel/500.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/montserrat/400.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';

export type Produto = {
  nome: string;
  detalhe: string;
  preco: string; // preço que vale (o promocional, quando houver)
  precoDe?: string; // preço cheio, riscado, quando a peça está em promoção
  imagem: string; // arquivo dentro de public/
};

export type ReelProps = {
  marca: string;
  titulo: string;
  subtitulo: string;
  produtos: Produto[];
  chamada: string;
  beneficios: string[];
};

export const INTRO = 60;
export const CENA = 105;
export const OUTRO = 96;
export const TRANS = 15;
export const duracao = (n: number) => INTRO + n * CENA + OUTRO - (n + 1) * TRANS;
// segundo em que cada peça entra na tela (para a trilha bater junto)
export const cortes = (n: number, fps = 30) => Array.from({length: n}, (_, i) => (INTRO - TRANS + i * (CENA - TRANS)) / fps);
export const inicioFinal = (n: number, fps = 30) => (INTRO - TRANS + n * (CENA - TRANS)) / fps;

const C = {
  bg: '#0e0c0b',
  glow: '#2b231d',
  champ: '#d8bf96',
  champSoft: 'rgba(216,191,150,0.55)',
  ivory: '#f6f1ea',
  muted: 'rgba(246,241,234,0.62)',
};
const SERIF = 'Cinzel, serif';
const SANS = 'Montserrat, sans-serif';

// espera as fontes da marca carregarem antes de desenhar
const useFontes = () => {
  const [h] = useState(() => delayRender('fontes'));
  useState(() => {
    Promise.all([
      document.fonts.load('600 60px Cinzel'),
      document.fonts.load('500 60px Cinzel'),
      document.fonts.load('400 30px Montserrat'),
      document.fonts.load('500 30px Montserrat'),
      document.fonts.load('600 30px Montserrat'),
    ]).then(() => continueRender(h)).catch(() => continueRender(h));
    return null;
  });
};

const Fundo: React.FC = () => {
  const f = useCurrentFrame();
  const x = 50 + Math.sin(f / 70) * 8;
  const y = 42 + Math.cos(f / 90) * 5;
  return <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 55% at ${x}% ${y}%, ${C.glow} 0%, ${C.bg} 70%)`}} />;
};

const Brilho: React.FC<{x: number; y: number; s: number; atraso: number}> = ({x, y, s, atraso}) => {
  const f = useCurrentFrame();
  const t = ((f + atraso) % 48) / 48;
  const a = Math.sin(t * Math.PI);
  const k = 0.35 + a * 0.65;
  return (
    <svg
      width={s}
      height={s}
      viewBox="-10 -10 20 20"
      style={{position: 'absolute', left: x - s / 2, top: y - s / 2, opacity: a * 0.95, transform: `scale(${k}) rotate(${t * 40}deg)`, filter: 'drop-shadow(0 0 5px rgba(201,160,90,0.8))'}}
    >
      <path d="M0 -10 C1 -2 2 -1 10 0 C2 1 1 2 0 10 C-1 2 -2 1 -10 0 C-2 -1 -1 -2 0 -10Z" fill="#f1d9a8" />
    </svg>
  );
};

const Marca: React.FC<{marca: string}> = ({marca}) => (
  <div style={{position: 'absolute', top: 110, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 26, letterSpacing: 9, color: C.champ, textTransform: 'uppercase', fontWeight: 500}}>
    {marca}
  </div>
);

const Intro: React.FC<{p: ReelProps}> = ({p}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s1 = spring({frame: f - 4, fps, config: {damping: 200}});
  const s2 = spring({frame: f - 14, fps, config: {damping: 200}});
  const linha = interpolate(f, [10, 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic)});
  const tam = p.titulo.length > 10 ? Math.max(76, 1180 / p.titulo.length) : 118;
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center', marginTop: -60, padding: '0 60px'}}>
        <div style={{fontFamily: SERIF, fontWeight: 600, fontSize: tam, color: C.ivory, lineHeight: 1.05, opacity: s1, transform: `translateY(${(1 - s1) * 40}px)`}}>{p.titulo}</div>
        <div style={{margin: '44px auto', height: 2, width: 360 * linha, background: `linear-gradient(90deg, transparent, ${C.champ}, transparent)`}} />
        <div style={{fontFamily: SANS, fontSize: 36, letterSpacing: 12, color: C.champ, textTransform: 'uppercase', opacity: s2, transform: `translateY(${(1 - s2) * 24}px)`}}>{p.subtitulo}</div>
      </div>
      <Brilho x={250} y={760} s={46} atraso={0} />
      <Brilho x={840} y={1130} s={36} atraso={20} />
      <Brilho x={790} y={700} s={26} atraso={34} />
    </AbsoluteFill>
  );
};

const CenaProduto: React.FC<{prod: Produto; i: number; total: number}> = ({prod, i, total}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entra = spring({frame: f - 4, fps, config: {damping: 18, stiffness: 90, mass: 0.9}});
  const zoom = interpolate(f, [0, CENA + TRANS], [1.0, 1.07]);
  const txt = (d: number) => spring({frame: f - d, fps, config: {damping: 200}});
  const t1 = txt(16), t2 = txt(24), t3 = txt(32);
  const W = 800, H = 940, top = 240;
  const nomeTam = prod.nome.length > 30 ? 50 : 58;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute', left: (1080 - W) / 2, top, width: W, height: H, borderRadius: 36, overflow: 'hidden', background: '#ffffff',
          boxShadow: '0 40px 90px rgba(0,0,0,0.55)', transform: `scale(${0.9 + entra * 0.1})`, opacity: Math.min(1, entra * 1.4),
        }}
      >
        <Img src={staticFile(prod.imagem)} style={{width: '100%', height: '100%', objectFit: 'contain', transform: `scale(${zoom})`}} />
        <div style={{position: 'absolute', inset: 0, borderRadius: 36, boxShadow: `inset 0 0 0 2px ${C.champSoft}`}} />
      </div>
      <Brilho x={(1080 - W) / 2 + 40} y={top + 30} s={54} atraso={i * 11} />
      <Brilho x={(1080 + W) / 2 - 20} y={top + H - 70} s={40} atraso={i * 11 + 22} />
      <Brilho x={(1080 + W) / 2 - 90} y={top + 120} s={28} atraso={i * 11 + 36} />

      <div style={{position: 'absolute', top: top + H + 60, width: '100%', textAlign: 'center'}}>
        {prod.detalhe ? (
          <div style={{fontFamily: SANS, fontSize: 25, letterSpacing: 7, textTransform: 'uppercase', color: C.champ, opacity: t1, transform: `translateY(${(1 - t1) * 20}px)`}}>
            {prod.detalhe}
          </div>
        ) : null}
        <div style={{fontFamily: SERIF, fontWeight: 500, fontSize: nomeTam, color: C.ivory, marginTop: 20, lineHeight: 1.15, padding: '0 70px', opacity: t2, transform: `translateY(${(1 - t2) * 24}px)`}}>
          {prod.nome}
        </div>
        <div style={{marginTop: 30, opacity: t3, transform: `scale(${0.85 + t3 * 0.15})`, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 22}}>
          {prod.precoDe ? (
            <span style={{fontFamily: SANS, fontSize: 34, color: C.muted, textDecoration: 'line-through', textDecorationThickness: 2}}>{prod.precoDe}</span>
          ) : null}
          <span style={{fontFamily: SANS, fontWeight: 600, fontSize: 52, color: C.bg, background: C.champ, padding: '12px 42px', borderRadius: 999}}>{prod.preco}</span>
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 90, width: '100%', textAlign: 'center', fontFamily: SANS, fontSize: 24, letterSpacing: 6, color: C.muted}}>
        {String(i + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </div>
    </AbsoluteFill>
  );
};

const Outro: React.FC<{p: ReelProps}> = ({p}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = (d: number) => spring({frame: f - d, fps, config: {damping: 200}});
  const pulso = 1 + Math.max(0, Math.sin((f - 40) / 7)) * 0.03 * (f > 40 ? 1 : 0);
  const cta = spring({frame: f - 34, fps, config: {damping: 14, stiffness: 120}});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
      <div style={{textAlign: 'center', marginTop: -40}}>
        {p.beneficios.map((b, k) => {
          const v = s(6 + k * 7);
          return (
            <div key={b} style={{fontFamily: SERIF, fontWeight: 500, fontSize: 50, color: C.ivory, margin: '20px 0', opacity: v, transform: `translateY(${(1 - v) * 26}px)`}}>
              {b}
            </div>
          );
        })}
        <div
          style={{
            marginTop: 90, display: 'inline-block', fontFamily: SANS, fontWeight: 600, fontSize: 42, letterSpacing: 1, color: C.bg, background: C.champ,
            padding: '26px 64px', borderRadius: 999, opacity: Math.min(1, cta * 1.5), transform: `scale(${(0.7 + cta * 0.3) * pulso})`,
          }}
        >
          {p.chamada}
        </div>
      </div>
      <Brilho x={230} y={620} s={40} atraso={5} />
      <Brilho x={860} y={1290} s={48} atraso={25} />
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = (p) => {
  useFontes();
  const n = p.produtos.length;
  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <Fundo />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO}>
          <Intro p={p} />
        </TransitionSeries.Sequence>
        {p.produtos.map((prod, i) => (
          <React.Fragment key={prod.imagem + i}>
            <TransitionSeries.Transition presentation={i === 0 ? fade() : slide({direction: 'from-right'})} timing={linearTiming({durationInFrames: TRANS})} />
            <TransitionSeries.Sequence durationInFrames={CENA}>
              <CenaProduto prod={prod} i={i} total={n} />
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANS})} />
        <TransitionSeries.Sequence durationInFrames={OUTRO}>
          <Outro p={p} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Marca marca={p.marca} />
    </AbsoluteFill>
  );
};
