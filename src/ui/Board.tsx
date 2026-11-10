import { useEffect, useRef } from 'react';
import { BoardRenderer } from '../board/renderer';
import { getTable } from '../core/multipliers';
import { useGame, useGameState } from './game-context';
import { usePrefersReducedMotion } from './hooks';

export function Board() {
  const game = useGame();
  const rows = useGameState((s) => s.rows);
  const risk = useGameState((s) => s.risk);
  const reducedMotion = usePrefersReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BoardRenderer | null>(null);

  // Create the renderer once; connect it to the engine.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new BoardRenderer(canvas, { onLand: (id) => game.land(id) });
    rendererRef.current = renderer;
    const { rows: r, risk: k } = game.getState();
    renderer.setLayout(r, getTable(r, k));

    const fit = () => {
      const rect = wrap.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);

    const off = game.on((event) => {
      if (event.type === 'ball') renderer.addBall(event.ball.id, event.ball.result.path);
    });

    return () => {
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

  return (
    <div ref={wrapRef} className="board">
      <canvas ref={canvasRef} className="board__canvas" />
    </div>
  );
}
