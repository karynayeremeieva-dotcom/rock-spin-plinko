import type { BoardGeometry } from '../board/geometry';

/**
 * What the on-screen tour needs from the board: where the canvas and its bins are, and a
 * way to send a free test ball that never touches the game state.
 */
export interface BoardHandle {
  canvas(): HTMLCanvasElement | null;
  geometry(): BoardGeometry | null;
  demoDrop(): void;
}

let handle: BoardHandle | null = null;

export function setBoardHandle(next: BoardHandle | null): void {
  handle = next;
}

export function getBoardHandle(): BoardHandle | null {
  return handle;
}
