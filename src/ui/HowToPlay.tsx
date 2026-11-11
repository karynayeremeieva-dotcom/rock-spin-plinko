import { useEffect, useRef, useState, type ReactNode } from 'react';
import { binColor, rgb } from '../board/theme';
import { useI18n } from '../i18n/context';
import type { Dictionary } from '../i18n/dictionaries';
import { usePrefersReducedMotion } from './hooks';

/**
 * "How to play" as a short animated tour: five steps, each with a small looping
 * SVG scene in the board's style. Swipe, arrow keys or the buttons move between steps.
 * With reduced motion the scenes are static.
 */

const STEPS: {
  title: keyof Dictionary;
  text: keyof Dictionary;
  Scene: (p: SceneProps) => ReactNode;
}[] = [
  { title: 'how1Title', text: 'how1Text', Scene: SetupScene },
  { title: 'how2Title', text: 'how2Text', Scene: DropScene },
  { title: 'how3Title', text: 'how3Text', Scene: MultiplierScene },
  { title: 'how4Title', text: 'how4Text', Scene: RiskScene },
  { title: 'how5Title', text: 'how5Text', Scene: FairScene },
];

interface SceneProps {
  still: boolean;
}

export function HowToPlay({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const still = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;
  const swipeStart = useRef<number | null>(null);

  const go = (next: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, next)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = STEPS[step] ?? STEPS[0];
  if (!current) return null;
  const { Scene } = current;

  return (
    <div
      className="howto"
      onPointerDown={(e) => {
        swipeStart.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (swipeStart.current === null) return;
        const dx = e.clientX - swipeStart.current;
        swipeStart.current = null;
        if (dx < -40) go(step + 1);
        if (dx > 40) go(step - 1);
      }}
    >
      {/* key restarts the scene and the slide-in animation on every step */}
      <div key={step} className="howto__slide">
        <div className="howto__scene" aria-hidden="true">
          <Scene still={still} />
        </div>
        <p className="howto__step">
          {t.howStep.replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
        </p>
        <h3 className="howto__title">{t[current.title]}</h3>
        <p className="howto__text">{t[current.text]}</p>
      </div>

      <div className="howto__dots" role="tablist">
        {STEPS.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-label={t.howStep
              .replace('{n}', String(i + 1))
              .replace('{total}', String(STEPS.length))}
            className={`howto__dot ${i === step ? 'howto__dot--on' : ''}`}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <div className="howto__nav">
        <button
          type="button"
          className="chip howto__back"
          onClick={() => go(step - 1)}
          disabled={step === 0}
        >
          {t.howBack}
        </button>
        <button
          type="button"
          className="howto__next"
          onClick={() => (last ? onDone() : go(step + 1))}
        >
          {last ? t.howPlay : t.howNext}
        </button>
      </div>
    </div>
  );
}

// ---------- scenes (viewBox 240×140) ----------

const STRING = '#d4d8de';
const HOT = '#ffb43c';
const binFill = (k: number, rows: number) => rgb(binColor(Math.abs(k - rows / 2) / (rows / 2)));

/** SMIL animation only when motion is allowed. */
function Anim({ still, children }: { still: boolean; children: ReactNode }) {
  return still ? null : <>{children}</>;
}

function Ball({ r = 6 }: { r?: number }) {
  return (
    <>
      <circle r={r * 2.2} fill="#ff7a1a" opacity="0.25" />
      <circle r={r} fill="url(#howBall)" />
    </>
  );
}

function Defs() {
  return (
    <defs>
      <radialGradient id="howBall">
        <stop offset="0" stopColor="#fffbea" />
        <stop offset="0.4" stopColor="#ffe7a3" />
        <stop offset="0.75" stopColor="#ffb43c" />
        <stop offset="1" stopColor="#ff6a18" />
      </radialGradient>
      <filter id="howGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2.5" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

/** Step 1: bet, rows and risk light up in turn. */
function SetupScene({ still }: SceneProps) {
  const { t } = useI18n();
  const cycle = '4.5s';
  const ring = (begin: number) => (
    <Anim still={still}>
      <animate
        attributeName="stroke-opacity"
        values="0;0;1;1;0;0"
        keyTimes={`0;${begin};${begin + 0.04};${begin + 0.28};${begin + 0.32};1`}
        dur={cycle}
        repeatCount="indefinite"
      />
    </Anim>
  );
  const swap = (values: string) => (
    <Anim still={still}>
      <animate
        attributeName="opacity"
        values={values}
        dur={cycle}
        repeatCount="indefinite"
        calcMode="discrete"
      />
    </Anim>
  );
  return (
    <svg viewBox="0 0 240 140">
      <Defs />
      {/* bet */}
      <rect
        x="30"
        y="12"
        width="180"
        height="32"
        rx="9"
        fill="#1e1c20"
        stroke={HOT}
        strokeOpacity={still ? 1 : 0}
        strokeWidth="2"
      >
        {ring(0)}
      </rect>
      <text x="48" y="33" className="howto__svg-num">
        1.00{swap('1;1;0;0;1')}
      </text>
      <text x="48" y="33" className="howto__svg-num" opacity="0">
        2.00{swap('0;0;1;1;0')}
      </text>
      <text x="196" y="33" textAnchor="end" className="howto__svg-unit">
        RC
      </text>
      {/* rows */}
      <rect
        x="30"
        y="54"
        width="80"
        height="32"
        rx="9"
        fill="#1e1c20"
        stroke={HOT}
        strokeOpacity="0"
        strokeWidth="2"
      >
        {ring(0.33)}
      </rect>
      <text x="70" y="75" textAnchor="middle" className="howto__svg-num">
        8{swap('1;1;1;0;0')}
      </text>
      <text x="70" y="75" textAnchor="middle" className="howto__svg-num" opacity="0">
        16{swap('0;0;0;1;1')}
      </text>
      <text x="130" y="75" className="howto__svg-unit">
        8–16
      </text>
      {/* risk */}
      <rect
        x="30"
        y="96"
        width="180"
        height="32"
        rx="9"
        fill="#1e1c20"
        stroke={HOT}
        strokeOpacity="0"
        strokeWidth="2"
      >
        {ring(0.66)}
      </rect>
      <rect x="34" y="100" width="56" height="24" rx="6" fill="#4f95e0">
        <Anim still={still}>
          <animate
            attributeName="x"
            values="34;34;92;150;150"
            keyTimes="0;0.66;0.78;0.9;1"
            dur={cycle}
            repeatCount="indefinite"
          />
          <animate
            attributeName="fill"
            values="#4f95e0;#4f95e0;#ffb43c;#ff4a2a;#ff4a2a"
            keyTimes="0;0.66;0.78;0.9;1"
            dur={cycle}
            repeatCount="indefinite"
          />
        </Anim>
      </rect>
      {[t.riskLow, t.riskMedium, t.riskHigh].map((label, i) => (
        <text key={label} x={62 + i * 58} y="117" textAnchor="middle" className="howto__svg-label">
          {label}
        </text>
      ))}
    </svg>
  );
}

/** Step 2: a ball drops through four strings, each one glows when plucked. */
function DropScene({ still }: SceneProps) {
  const rows = 4;
  const s = 22;
  const rowY = (r: number) => 34 + r * 18;
  const pegX = (r: number, i: number) => 120 + (i - (r + 2) / 2) * s;
  const hits = [0.13, 0.3, 0.47, 0.63];
  const dur = '2.8s';
  return (
    <svg viewBox="0 0 240 140">
      <Defs />
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          <line
            x1={pegX(r, 0) - 10}
            x2={pegX(r, r + 2) + 10}
            y1={rowY(r)}
            y2={rowY(r)}
            stroke={STRING}
            strokeWidth={1 + r * 0.4}
            strokeLinecap="round"
          >
            <Anim still={still}>
              <animate
                attributeName="stroke"
                values={`${STRING};${STRING};${HOT};${STRING};${STRING}`}
                keyTimes={`0;${(hits[r] ?? 0) - 0.01};${hits[r] ?? 0};${(hits[r] ?? 0) + 0.12};1`}
                dur={dur}
                repeatCount="indefinite"
              />
            </Anim>
          </line>
          {Array.from({ length: r + 3 }, (_, i) => (
            <circle key={i} cx={pegX(r, i)} cy={rowY(r)} r="2.6" fill="#b4b8bf" />
          ))}
        </g>
      ))}
      {Array.from({ length: rows + 1 }, (_, k) => (
        <rect
          key={k}
          x={120 + (k - 2) * s - 10}
          y="106"
          width="20"
          height="16"
          rx="4"
          fill={binFill(k, rows)}
        >
          {k === 3 && (
            <Anim still={still}>
              <animate
                attributeName="y"
                values="106;106;111;106;106"
                keyTimes="0;0.78;0.84;0.9;1"
                dur={dur}
                repeatCount="indefinite"
              />
            </Anim>
          )}
        </rect>
      ))}
      <g filter="url(#howGlow)" transform={still ? 'translate(131 45)' : undefined}>
        <Ball r={5} />
        <Anim still={still}>
          <animateMotion
            path="M120 6 L120 27 Q126 16 131 45 Q125 34 120 63 Q126 52 131 81 Q138 72 142 108"
            dur={dur}
            keyPoints="0;1;1"
            keyTimes="0;0.78;1"
            calcMode="linear"
            repeatCount="indefinite"
          />
        </Anim>
      </g>
    </svg>
  );
}

/** Step 3: edge bins pay the most; the ball lands on the edge and the win floats up. */
function MultiplierScene({ still }: SceneProps) {
  const rows = 8;
  const labels = ['5.6', '2.1', '1.1', '1', '0.5', '1', '1.1', '2.1', '5.6'];
  const w = 24;
  const x = (k: number) => 120 + (k - 4) * w;
  const dur = '2.4s';
  return (
    <svg viewBox="0 0 240 140">
      <Defs />
      {labels.map((m, k) => (
        <g key={k}>
          <rect
            x={x(k) - w / 2 + 1}
            y="92"
            width={w - 2}
            height="26"
            rx="5"
            fill={binFill(k, rows)}
          >
            {k === 8 && (
              <Anim still={still}>
                <animate
                  attributeName="y"
                  values="92;92;99;92;92"
                  keyTimes="0;0.5;0.56;0.64;1"
                  dur={dur}
                  repeatCount="indefinite"
                />
              </Anim>
            )}
          </rect>
          <text x={x(k)} y="109" textAnchor="middle" className="howto__svg-bin">
            {m}
          </text>
        </g>
      ))}
      <g filter="url(#howGlow)" transform={still ? `translate(${x(8)} 80)` : undefined}>
        <Ball r={6} />
        <Anim still={still}>
          <animateMotion
            path={`M120 6 Q190 10 ${x(8)} 86`}
            dur={dur}
            keyPoints="0;1;1"
            keyTimes="0;0.5;1"
            calcMode="spline"
            keySplines="0.5 0 1 1;0 0 1 1"
            repeatCount="indefinite"
          />
        </Anim>
      </g>
      <text
        x={x(8) - 6}
        y="70"
        textAnchor="middle"
        className="howto__svg-win"
        opacity={still ? 1 : 0}
      >
        +5.60
        <Anim still={still}>
          <animate
            attributeName="opacity"
            values="0;0;1;1;0"
            keyTimes="0;0.52;0.6;0.85;1"
            dur={dur}
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values="80;80;66;58;56"
            keyTimes="0;0.52;0.62;0.85;1"
            dur={dur}
            repeatCount="indefinite"
          />
        </Anim>
      </text>
    </svg>
  );
}

/** Step 4: three risk levels; the edges grow as risk goes up. */
function RiskScene({ still }: SceneProps) {
  const { t } = useI18n();
  const tables: [string, number[], string][] = [
    [t.riskLow, [5.6, 2.1, 1.1, 1, 0.5], '#4f95e0'],
    [t.riskMedium, [13, 3, 1.3, 0.7, 0.4], '#ffb43c'],
    [t.riskHigh, [29, 4, 1.5, 0.3, 0.2], '#ff4a2a'],
  ];
  const h = (m: number) => 6 + Math.log10(m * 10) * 24;
  return (
    <svg viewBox="0 0 240 140">
      {tables.map(([label, half, color], g) => {
        const full = [...half, ...half.slice(0, -1).reverse()];
        const gx = 14 + g * 76;
        return (
          <g key={label}>
            {full.map((m, k) => {
              const bh = h(m);
              return (
                <rect
                  key={k}
                  x={gx + k * 7.4}
                  y={108 - bh}
                  width="5.6"
                  height={bh}
                  rx="1.5"
                  fill={binFill(k, 8)}
                  className={still ? undefined : 'howto__bar'}
                  style={{ animationDelay: `${g * 0.35 + Math.abs(k - 4) * 0.05}s` }}
                />
              );
            })}
            <text x={gx + 32} y="126" textAnchor="middle" className="howto__svg-label" fill={color}>
              {label}
            </text>
            <text x={gx + 32} y="20" textAnchor="middle" className="howto__svg-edge" fill={color}>
              {half[0]}×
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Step 5: a shield, RNG bits ticking and the RTP badge. */
function FairScene({ still }: SceneProps) {
  const bits = '1 0 1 1 0 0 1 0 1 1 0 1';
  return (
    <svg viewBox="0 0 240 140">
      <Defs />
      <g filter="url(#howGlow)" className={still ? undefined : 'howto__shield'}>
        <path
          d="M120 14 L150 26 V56 C150 76 136 90 120 98 C104 90 90 76 90 56 V26 Z"
          fill="#141317"
          stroke={HOT}
          strokeWidth="2.5"
        />
        <path
          d="M106 56 L117 67 L136 46"
          fill="none"
          stroke="#5ee08a"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <text x="120" y="118" textAnchor="middle" className="howto__svg-bits">
        {bits}
        <Anim still={still}>
          <animate
            attributeName="opacity"
            values="0.35;0.9;0.35"
            dur="1.2s"
            repeatCount="indefinite"
          />
        </Anim>
      </text>
      <rect x="168" y="30" width="58" height="24" rx="12" fill="#1e1c20" stroke="#5ee08a" />
      <text x="197" y="46" textAnchor="middle" className="howto__svg-badge" fill="#5ee08a">
        RTP 99%
      </text>
      <rect x="14" y="30" width="58" height="24" rx="12" fill="#1e1c20" stroke={HOT} />
      <text x="43" y="46" textAnchor="middle" className="howto__svg-badge" fill={HOT}>
        DEMO
      </text>
    </svg>
  );
}
