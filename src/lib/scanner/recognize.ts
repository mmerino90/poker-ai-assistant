// Card recognition from a cropped card image.
//
// Strategy (robust to a compressed Discord stream, and always user-correctable):
//   1. Decide if the slot is empty (mostly table felt, no white card face).
//   2. OCR the rank glyph in the top-left corner (Tesseract, restricted charset).
//   3. Detect the suit: red vs black by pixel colour, then heart/diamond or
//      spade/club by matching the little suit glyph against reference shapes.
//
// Recognition is assistive: the UI shows the best guess and lets you fix any
// card with one tap, so an occasional misread never sends bad advice silently.

import { type Card } from "../cards";
import { createWorker, type Worker, PSM } from "tesseract.js";

export type CardGuess = {
  card: Card | null; // best-guess card, or null if empty/unreadable
  empty: boolean;
  rankText: string;
  rank: number | null;
  suit: number | null; // 0=s,1=h,2=d,3=c
  red: boolean;
  confidence: number; // 0..1
};

const RANK_FROM_TEXT: Record<string, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "10": 10,
  "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

// --- Tesseract worker (lazy singleton) --------------------------------------
let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker("eng");
      await w.setParameters({
        tessedit_char_whitelist: "A23456789TJQK10",
        tessedit_pageseg_mode: PSM.SINGLE_WORD,
      });
      return w;
    })();
  }
  return workerPromise;
}

export async function terminateWorker() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}

// --- Pixel helpers ----------------------------------------------------------
function getCtx(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context");
  return ctx;
}

/** Fraction of pixels that look like a white card face (bright, low saturation). */
function whiteFraction(c: HTMLCanvasElement): number {
  const ctx = getCtx(c);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  let white = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 170 && max - min < 40) white++;
  }
  return white / n;
}

/** Crop the top-left corner where rank + suit glyph live. */
function corner(card: HTMLCanvasElement): HTMLCanvasElement {
  const cw = Math.max(1, Math.round(card.width * 0.5));
  const ch = Math.max(1, Math.round(card.height * 0.55));
  const out = document.createElement("canvas");
  const scale = Math.max(1, 80 / cw); // upscale small crops for OCR
  out.width = Math.round(cw * scale);
  out.height = Math.round(ch * scale);
  const ctx = getCtx(out);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(card, 0, 0, cw, ch, 0, 0, out.width, out.height);
  return out;
}

/**
 * Binarize "ink" (dark or saturated-red glyphs) to black-on-white for OCR, and
 * report the red fraction of the ink so we can tell the suit colour.
 */
function inkMaskAndColour(c: HTMLCanvasElement): { mask: HTMLCanvasElement; red: boolean } {
  const ctx = getCtx(c);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const { data } = img;
  let inkRed = 0, inkBlack = 0;
  const out = ctx.createImageData(c.width, c.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const isRed = r > 110 && r - g > 45 && r - b > 45;
    const isDark = lum < 110;
    const ink = isRed || isDark;
    const v = ink ? 0 : 255; // black ink on white
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
    if (ink) {
      if (isRed) inkRed++;
      else inkBlack++;
    }
  }
  const mask = document.createElement("canvas");
  mask.width = c.width;
  mask.height = c.height;
  getCtx(mask).putImageData(out, 0, 0);
  return { mask, red: inkRed > inkBlack };
}

// --- Suit shape matching ----------------------------------------------------
const GRID = 24;
let suitRefs: { suit: number; grid: Float32Array }[] | null = null;

function rasterGlyph(ch: string): Float32Array {
  const c = document.createElement("canvas");
  c.width = c.height = GRID;
  const ctx = getCtx(c);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.fillStyle = "#000";
  ctx.font = `${GRID - 4}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(ch, GRID / 2, GRID / 2);
  return toGrid(c);
}

function toGrid(c: HTMLCanvasElement): Float32Array {
  const ctx = getCtx(c);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  // Downscale to GRID x GRID average-darkness.
  const grid = new Float32Array(GRID * GRID);
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      const sx0 = Math.floor((gx / GRID) * c.width);
      const sx1 = Math.floor(((gx + 1) / GRID) * c.width);
      const sy0 = Math.floor((gy / GRID) * c.height);
      const sy1 = Math.floor(((gy + 1) / GRID) * c.height);
      let sum = 0, count = 0;
      for (let y = sy0; y <= sy1 && y < c.height; y++) {
        for (let x = sx0; x <= sx1 && x < c.width; x++) {
          const idx = (y * c.width + x) * 4;
          const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          sum += 255 - lum; // darkness
          count++;
        }
      }
      grid[gy * GRID + gx] = count ? sum / count / 255 : 0;
    }
  }
  return grid;
}

function suitReferences() {
  if (!suitRefs) {
    suitRefs = [
      { suit: 0, grid: rasterGlyph("♠") }, // spade
      { suit: 1, grid: rasterGlyph("♥") }, // heart
      { suit: 2, grid: rasterGlyph("♦") }, // diamond
      { suit: 3, grid: rasterGlyph("♣") }, // club
    ];
  }
  return suitRefs;
}

function similarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Best suit among the two candidates matching the detected colour. */
function matchSuit(suitGlyph: HTMLCanvasElement, red: boolean): number {
  const grid = toGrid(suitGlyph);
  const candidates = red ? [1, 2] : [0, 3];
  let best = candidates[0], bestScore = -1;
  for (const ref of suitReferences()) {
    if (!candidates.includes(ref.suit)) continue;
    const s = similarity(grid, ref.grid);
    if (s > bestScore) {
      bestScore = s;
      best = ref.suit;
    }
  }
  return best;
}

/** Crop just the small suit glyph (lower part of the corner). */
function suitGlyphCrop(cornerCanvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  const sw = Math.round(cornerCanvas.width * 0.7);
  const sy = Math.round(cornerCanvas.height * 0.5);
  const sh = cornerCanvas.height - sy;
  out.width = sw;
  out.height = sh;
  getCtx(out).drawImage(cornerCanvas, 0, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

// --- Public API -------------------------------------------------------------
export async function recognizeCard(card: HTMLCanvasElement): Promise<CardGuess> {
  const empty: CardGuess = {
    card: null, empty: true, rankText: "", rank: null, suit: null, red: false, confidence: 0,
  };
  if (whiteFraction(card) < 0.25) return empty; // no white card face -> empty slot

  const cor = corner(card);
  const { mask, red } = inkMaskAndColour(cor);

  const worker = await getWorker();
  const { data } = await worker.recognize(mask);
  let text = (data.text || "").toUpperCase().replace(/[^A23456789TJQK0]/g, "");
  if (text.startsWith("10")) text = "T";
  else text = text.slice(0, 1);
  const rank = RANK_FROM_TEXT[text] ?? null;

  const suit = matchSuit(suitGlyphCrop(cor), red);
  const ocrConf = (data.confidence ?? 0) / 100;

  if (rank === null) {
    return { card: null, empty: false, rankText: text, rank: null, suit, red, confidence: ocrConf * 0.5 };
  }
  const c: Card = { rank, suit };
  return { card: c, empty: false, rankText: text, rank, suit, red, confidence: ocrConf };
}
