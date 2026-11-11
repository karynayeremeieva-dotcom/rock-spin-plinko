import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { binCenterX } from '../board/geometry';
import { useI18n } from '../i18n/context';
import type { Dictionary } from '../i18n/dictionaries';
import { showBackButton } from '../platform/telegram';
import { getBoardHandle } from './tour-bridge';

/**
 * "How to play" as a tour over the real screen: everything is dimmed except the real
 * elements of the current step, and a card in free space explains them. The risk step can
 * be tried for real while the bins it changes stay lit; the drop step sends free test balls
 * that never touch the balance.
 */

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Spot {
  rect: () => Rect | null;
  /** Clicks inside reach the app (try the control for real). */
  interactive?: boolean;
}

interface Step {
  title: keyof Dictionary;
  text: keyof Dictionary;
  spots: Spot[];
  demo?: boolean;
}

const PAD = 6;
const RADIUS = 14;
const GAP = 12;

const fromElement = (selector: string) => (): Rect | null => {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

const bins = (): Rect | null => {
  const board = getBoardHandle();
  const canvas = board?.canvas();
  const g = board?.geometry();
  if (!canvas || !g) return null;
  const c = canvas.getBoundingClientRect();
  const left = binCenterX(g, 0) - g.binWidth / 2;
  const right = binCenterX(g, g.rows) + g.binWidth / 2;
  return { x: c.left + left, y: c.top + g.binTop, w: right - left, h: g.binHeight };
};

const STEPS: Step[] = [
  { title: 'how1Title', text: 'how1Text', spots: [{ rect: fromElement('.panel') }] },
  { title: 'how2Title', text: 'how2Text', spots: [{ rect: fromElement('.board') }], demo: true },
  { title: 'how3Title', text: 'how3Text', spots: [{ rect: bins }] },
  {
    title: 'how4Title',
    text: 'how4Text',
    spots: [{ rect: fromElement('.segmented'), interactive: true }, { rect: bins }],
  },
  {
    title: 'how5Title',
    text: 'how5Text',
    spots: [
      { rect: fromElement('.feed') },
      { rect: fromElement('.topbar__actions .icon-btn:nth-child(2)') },
    ],
  },
];

const pad = (r: Rect): Rect => ({ x: r.x - PAD, y: r.y - PAD, w: r.w + PAD * 2, h: r.h + PAD * 2 });

const same = (a: Rect[], b: Rect[]) =>
  a.length === b.length &&
  a.every((r, i) => {
    const o = b[i];
    return (
      !!o &&
      Math.abs(r.x - o.x) < 0.5 &&
      Math.abs(r.y - o.y) < 0.5 &&
      Math.abs(r.w - o.w) < 0.5 &&
      Math.abs(r.h - o.h) < 0.5
    );
  });

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const roundRect = ({ x, y, w, h }: Rect, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${
    x + w - r
  } ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

/** Where the card goes: next to a lit spot, never over one, inside the screen. */
function placeCard(holes: Rect[], cw: number, ch: number, vw: number, vh: number) {
  const fits = (c: Rect) =>
    c.y >= GAP && c.y + c.h <= vh - GAP && !holes.some((h) => overlaps(c, h));
  const xFor = (h: Rect) => Math.max(GAP, Math.min(vw - cw - GAP, h.x + h.w / 2 - cw / 2));
  for (const h of holes) {
    for (const y of [h.y + h.h + GAP, h.y - GAP - ch]) {
      const c = { x: xFor(h), y, w: cw, h: ch };
      if (fits(c)) return c;
    }
  }
  // Between two spots, if there's room.
  const sorted = [...holes].sort((a, b) => a.y - b.y);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (!a || !b) continue;
    const y = (a.y + a.h + b.y - ch) / 2;
    const c = { x: (vw - cw) / 2, y, w: cw, h: ch };
    if (fits(c)) return c;
  }
  // Last resort: overlap the bottom of the first spot.
  const first = holes[0];
  const y = first ? Math.min(vh - ch - GAP, first.y + first.h - ch - GAP) : (vh - ch) / 2;
  return { x: first ? xFor(first) : (vw - cw) / 2, y: Math.max(GAP, y), w: cw, h: ch };
}

export function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [holes, setHoles] = useState<Rect[]>([]);
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [card, setCard] = useState<{ x: number; y: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const current = STEPS[step] ?? STEPS[0];
  const last = step === STEPS.length - 1;
  const go = (next: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, next)));

  // Follow the targets every frame: resizes, layout shifts and the board settling move them.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = (current?.spots ?? [])
        .map((s) => s.rect())
        .map((r) => (r ? pad(r) : null))
        .filter((r): r is Rect => r !== null);
      setHoles((prev) => (same(prev, next) ? prev : next));
      setView((v) =>
        v.w === window.innerWidth && v.h === window.innerHeight
          ? v
          : { w: window.innerWidth, h: window.innerHeight },
      );
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [current]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const c = placeCard(holes, el.offsetWidth, el.offsetHeight, view.w, view.h);
    setCard((prev) =>
      prev && Math.abs(prev.x - c.x) < 0.5 && Math.abs(prev.y - c.y) < 0.5 ? prev : c,
    );
  }, [holes, view, step]);

  // Free test balls while the drop step is on.
  useEffect(() => {
    if (!current?.demo) return;
    const drop = () => getBoardHandle()?.demoDrop();
    drop();
    const timer = window.setInterval(drop, 1600);
    return () => window.clearInterval(timer);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      if (e.key === 'ArrowRight') setStep((s) => Math.min(STEPS.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    const hideBack = showBackButton(() => closeRef.current());
    cardRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      hideBack();
    };
  }, []);

  if (!current) return null;
  const dim = `M0 0H${view.w}V${view.h}H0Z ${holes.map((h) => roundRect(h, RADIUS)).join(' ')}`;

  return createPortal(
    <div className="tour" role="dialog" aria-modal="true" aria-label={t.howToPlay}>
      {/* The dim layer has real holes: clicks there reach the app when a spot allows it. */}
      <svg className="tour__dim" width={view.w} height={view.h} aria-hidden="true">
        <path d={dim} fillRule="evenodd" />
      </svg>
      {current.spots.map((spot, i) => {
        const h = holes[i];
        if (!h) return null;
        return (
          <div key={i}>
            {!spot.interactive && (
              <div
                className="tour__block"
                style={{ left: h.x, top: h.y, width: h.w, height: h.h }}
              />
            )}
            <div className="tour__ring" style={{ left: h.x, top: h.y, width: h.w, height: h.h }} />
          </div>
        );
      })}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="tour__card"
        style={card ? { left: card.x, top: card.y } : { visibility: 'hidden' }}
      >
        <p className="tour__step">
          {t.howStep.replace('{n}', String(step + 1)).replace('{total}', String(STEPS.length))}
        </p>
        <h3 key={step} className="tour__title">
          {t[current.title]}
        </h3>
        <p className="tour__text">{t[current.text]}</p>
        <div className="tour__nav">
          <button type="button" className="tour__skip" onClick={onClose}>
            {t.howSkip}
          </button>
          {step > 0 && (
            <button type="button" className="tour__back" onClick={() => go(step - 1)}>
              {t.howBack}
            </button>
          )}
          <button
            type="button"
            className="tour__next"
            onClick={() => (last ? onClose() : go(step + 1))}
          >
            {last ? t.howPlay : t.howNext}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
