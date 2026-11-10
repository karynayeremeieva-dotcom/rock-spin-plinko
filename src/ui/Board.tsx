import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { binAt, binCenterX } from '../board/geometry';
import { BoardRenderer } from '../board/renderer';
import { formatMultiplier } from '../board/theme';
import { calcPayout } from '../core/money';
import { binProbabilities, getTable } from '../core/multipliers';
import { useI18n } from '../i18n/context';
import { useGame, useGameState } from './game-context';
import { formatPercent } from './format';
import { usePrefersReducedMotion } from './hooks';

const BOARD_FONT = "'Inter Variable', system-ui, sans-serif";

interface Hover {
  bin: number;
  x: number;
  y: number;
}

export function Board() {
  const game = useGame();
  const rows = useGameState((s) => s.rows);
  const risk = useGameState((s) => s.risk);
  const reducedMotion = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  // Create the renderer once; connect it to the engine.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new BoardRenderer(
      canvas,
      { onLand: (id) => game.land(id) },
      { fontFamily: BOARD_FONT },
    );
    rendererRef.current = renderer;
    const { rows: r, risk: k } = game.getState();
    renderer.setLayout(r, getTable(r, k));

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      setHover(null);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);

    // Bin labels are drawn into sprites: redraw once the web font is in.
    let alive = true;
    void document.fonts?.load(`800 16px ${BOARD_FONT}`).then(() => alive && renderer.refresh());

    const off = game.on((event) => {
      if (event.type === 'ball') renderer.addBall(event.ball.id, event.ball.result.path);
    });

    return () => {
      alive = false;
      off();
      observer.disconnect();
      renderer.destroy();
      rendererRef.current = null;
      // Results are already decided: credit anything still in the air.
      game.landAll();
    };
  }, [game]);

  useEffect(() => {
    rendererRef.current?.setLayout(rows, getTable(rows, risk));
  }, [rows, risk]);

  useEffect(() => {
    rendererRef.current?.setReducedMotion(reducedMotion);
  }, [reducedMotion]);

  const findBin = (e: PointerEvent<HTMLCanvasElement>): Hover | null => {
    const g = rendererRef.current?.getGeometry();
    if (!g) return null;
    const rect = e.currentTarget.getBoundingClientRect();
    const bin = binAt(g, e.clientX - rect.left, e.clientY - rect.top);
    return bin < 0 ? null : { bin, x: binCenterX(g, bin), y: g.binTop };
  };

  return (
    <div ref={wrapRef} className="board">
      <canvas
        ref={canvasRef}
        className="board__canvas"
        onPointerMove={(e) => e.pointerType === 'mouse' && setHover(findBin(e))}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          const next = findBin(e);
          setHover((prev) => (next && prev?.bin === next.bin ? null : next));
        }}
      />
      {hover && <BinTooltip {...hover} />}
    </div>
  );
}

function BinTooltip({ bin, x, y }: Hover) {
  const { t, money } = useI18n();
  const rows = useGameState((s) => s.rows);
  const risk = useGameState((s) => s.risk);
  const bet = useGameState((s) => s.bet);
  const multiplier = getTable(rows, risk)[bin];
  const probability = binProbabilities(rows)[bin];
  if (multiplier === undefined || probability === undefined) return null;

  return (
    <div className="tooltip" role="tooltip" style={{ left: x, top: y }}>
      <div className="tooltip__mult">{formatMultiplier(multiplier, true)}</div>
      <dl className="tooltip__rows">
        <dt>{t.tooltipChance}</dt>
        <dd>{formatPercent(probability)}</dd>
        <dt>{t.tooltipWin}</dt>
        <dd>{money(calcPayout(bet, multiplier))} RC</dd>
      </dl>
    </div>
  );
}
