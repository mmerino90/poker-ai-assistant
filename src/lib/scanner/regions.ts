// Calibration regions for the scanner.
//
// The poker table sits somewhere inside the captured video (e.g. a phone stream
// shown in a Discord window). Since the layout is fixed, the user calibrates
// once by drawing boxes over their 2 hole cards and the row of community cards;
// we store the boxes as normalized [0..1] rectangles relative to the captured
// frame and reuse them every frame.

export type NormRect = { x: number; y: number; w: number; h: number };

export type Calibration = {
  hole: [NormRect, NormRect]; // your two hole cards
  board: NormRect; // a box around the whole 5-card community row
};

const STORAGE_KEY = "poker-scanner-calibration-v1";

/** Split the community-row box into 5 equal card cells, left to right. */
export function splitBoard(board: NormRect): NormRect[] {
  const cells: NormRect[] = [];
  const cellW = board.w / 5;
  for (let i = 0; i < 5; i++) {
    cells.push({ x: board.x + i * cellW, y: board.y, w: cellW, h: board.h });
  }
  return cells;
}

/** All seven card regions in scan order: 2 hole, then 5 board cells. */
export function allCardRegions(c: Calibration): NormRect[] {
  return [c.hole[0], c.hole[1], ...splitBoard(c.board)];
}

export function loadCalibration(): Calibration | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c?.hole?.length === 2 && c?.board) return c as Calibration;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveCalibration(c: Calibration): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function clearCalibration(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Normalize a pixel rect (possibly drawn backwards) into a 0..1 NormRect. */
export function pixelRectToNorm(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  frameW: number,
  frameH: number,
): NormRect {
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  return {
    x: left / frameW,
    y: top / frameH,
    w: w / frameW,
    h: h / frameH,
  };
}
