"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type Card, cardId } from "@/lib/cards";
import { estimateEquity } from "@/lib/equity";
import {
  screenCaptureSupported,
  startScreenCapture,
  stopStream,
  grabFrame,
  cropRegion,
} from "@/lib/scanner/capture";
import {
  type Calibration,
  type NormRect,
  splitBoard,
  loadCalibration,
  saveCalibration,
  clearCalibration,
  pixelRectToNorm,
} from "@/lib/scanner/regions";
import { recognizeCard, type CardGuess, terminateWorker } from "@/lib/scanner/recognize";
import { CardSlot, CardPickerModal } from "@/components/CardPicker";
import { Chip, Label } from "@/components/ui";

type Phase = "idle" | "calibrating" | "scanning";

const CALIB_STEPS = [
  "Draw a box around your LEFT hole card",
  "Draw a box around your RIGHT hole card",
  "Draw a box around ALL 5 community cards (the whole row)",
];

export default function ScannerPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLCanvasElement | null>(null); // native-res offscreen
  const dispRef = useRef<HTMLCanvasElement>(null); // visible, scaled

  const [phase, setPhase] = useState<Phase>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const [calib, setCalib] = useState<Calibration | null>(null);
  const [calibStep, setCalibStep] = useState(0);
  const draftHoleRef = useRef<NormRect[]>([]);

  const [opponents, setOpponents] = useState(1);
  const [guesses, setGuesses] = useState<CardGuess[]>([]);
  const [overrides, setOverrides] = useState<(Card | null | undefined)[]>(
    new Array(7).fill(undefined),
  );
  const [equity, setEquity] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState<number | null>(null);
  const [potStr, setPotStr] = useState("");
  const [callStr, setCallStr] = useState("");

  // refs the animation loop reads
  const phaseRef = useRef(phase);
  const calibRef = useRef(calib);
  const dragRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  // Keep the refs the rAF loop reads in sync with state (done in an effect, not
  // during render, per React's rules).
  useEffect(() => {
    phaseRef.current = phase;
    calibRef.current = calib;
  });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupported(screenCaptureSupported());
    frameRef.current = document.createElement("canvas");
    const saved = loadCalibration();
    if (saved) setCalib(saved);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // ---- Effective cards (override beats detection) -------------------------
  const effectiveCard = useCallback(
    (i: number): Card | null => {
      const o = overrides[i];
      if (o !== undefined) return o;
      return guesses[i]?.card ?? null;
    },
    [overrides, guesses],
  );

  const holeCards = [effectiveCard(0), effectiveCard(1)].filter(
    (c): c is Card => c !== null,
  );
  const boardCards = [2, 3, 4, 5, 6]
    .map((i) => effectiveCard(i))
    .filter((c): c is Card => c !== null);

  const usedIds = new Set<number>();
  for (let i = 0; i < 7; i++) {
    const c = effectiveCard(i);
    if (c) usedIds.add(cardId(c));
  }

  // ---- Draw saved/in-progress calibration boxes onto the preview ----------
  const drawBoxes = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const drawRect = (r: NormRect, color: string, label: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x * w, r.y * h, r.w * w, r.h * h);
        ctx.fillStyle = color;
        ctx.font = "11px sans-serif";
        ctx.fillText(label, r.x * w + 2, r.y * h - 3);
      };
      const c = calibRef.current;
      if (c) {
        drawRect(c.hole[0], "#f59e0b", "you");
        drawRect(c.hole[1], "#f59e0b", "you");
        splitBoard(c.board).forEach((cell, i) => drawRect(cell, "#34d399", `${i + 1}`));
      }
      if (phaseRef.current === "calibrating") {
        draftHoleRef.current.forEach((r) => drawRect(r, "#f59e0b", "you"));
      }
      const d = dragRef.current;
      if (d) {
        ctx.strokeStyle = "#fff";
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(
          Math.min(d.x0, d.x1),
          Math.min(d.y0, d.y1),
          Math.abs(d.x1 - d.x0),
          Math.abs(d.y1 - d.y0),
        );
        ctx.setLineDash([]);
      }
    },
    [],
  );

  // ---- Render loop: draw the captured frame + calibration boxes -----------
  useEffect(() => {
    if (!stream) return;
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      const disp = dispRef.current;
      const frame = frameRef.current;
      if (v && disp && frame && v.videoWidth) {
        grabFrame(v, frame);
        const cw = disp.clientWidth || 360;
        const scale = cw / v.videoWidth;
        disp.width = Math.round(v.videoWidth * scale);
        disp.height = Math.round(v.videoHeight * scale);
        const ctx = disp.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, disp.width, disp.height);
          drawBoxes(ctx, disp.width, disp.height);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [stream, drawBoxes]);

  // ---- Calibration mouse handlers ----------------------------------------
  function canvasPos(e: React.MouseEvent) {
    const disp = dispRef.current!;
    const rect = disp.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * disp.width,
      y: ((e.clientY - rect.top) / rect.height) * disp.height,
    };
  }

  function onDown(e: React.MouseEvent) {
    if (phase !== "calibrating") return;
    const p = canvasPos(e);
    dragRef.current = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  }
  function onMove(e: React.MouseEvent) {
    if (phase !== "calibrating" || !dragRef.current) return;
    const p = canvasPos(e);
    dragRef.current = { ...dragRef.current, x1: p.x, y1: p.y };
  }
  function onUp() {
    if (phase !== "calibrating" || !dragRef.current) return;
    const disp = dispRef.current!;
    const d = dragRef.current;
    dragRef.current = null;
    if (Math.abs(d.x1 - d.x0) < 6 || Math.abs(d.y1 - d.y0) < 6) return; // too small
    const norm = pixelRectToNorm(d.x0, d.y0, d.x1, d.y1, disp.width, disp.height);
    if (calibStep === 0) {
      draftHoleRef.current = [norm];
      setCalibStep(1);
    } else if (calibStep === 1) {
      draftHoleRef.current = [...draftHoleRef.current, norm];
      setCalibStep(2);
    } else {
      const full: Calibration = {
        hole: [draftHoleRef.current[0], draftHoleRef.current[1]],
        board: norm,
      };
      saveCalibration(full);
      setCalib(full);
      draftHoleRef.current = [];
      setCalibStep(0);
      setPhase("scanning");
    }
  }

  // ---- Scan loop ----------------------------------------------------------
  const scanningRef = useRef(false);
  useEffect(() => {
    if (phase !== "scanning" || !calib) return;
    let cancelled = false;
    const tick = async () => {
      if (scanningRef.current || cancelled) return;
      const frame = frameRef.current;
      if (!frame || !frame.width) return;
      scanningRef.current = true;
      try {
        const regions = [calib.hole[0], calib.hole[1], ...splitBoard(calib.board)];
        const results: CardGuess[] = [];
        for (const r of regions) {
          const crop = cropRegion(frame, r, 2);
          results.push(await recognizeCard(crop));
        }
        if (!cancelled) setGuesses(results);
      } catch (e) {
        console.error(e);
      } finally {
        scanningRef.current = false;
      }
    };
    const id = setInterval(tick, 1500);
    tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, calib]);

  // ---- Equity (recompute when effective cards / opponents change) ---------
  const holeKey = holeCards.map((c) => cardId(c)).join(",");
  const boardKey = boardCards.map((c) => cardId(c)).join(",");
  useEffect(() => {
    const id = setTimeout(() => {
      if (holeCards.length !== 2) {
        setEquity(null);
        return;
      }
      try {
        setEquity(estimateEquity(holeCards, boardCards, opponents, 8000).equity);
      } catch {
        setEquity(null);
      }
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holeKey, boardKey, opponents]);

  // ---- Lifecycle ----------------------------------------------------------
  async function start() {
    setError(null);
    try {
      const s = await startScreenCapture();
      setStream(s);
      const v = videoRef.current!;
      v.srcObject = s;
      await v.play();
      s.getVideoTracks()[0].addEventListener("ended", () => stopAll());
      setPhase(calib ? "scanning" : "calibrating");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start screen capture.");
    }
  }

  const stopAll = useCallback(() => {
    setStream((s) => {
      stopStream(s);
      return null;
    });
    setPhase("idle");
    setGuesses([]);
  }, []);

  useEffect(() => () => void terminateWorker(), []);

  function recalibrate() {
    clearCalibration();
    setCalib(null);
    draftHoleRef.current = [];
    setCalibStep(0);
    setPhase("calibrating");
  }

  function newHand() {
    setOverrides(new Array(7).fill(undefined));
  }

  function applyCorrection(card: Card | null) {
    if (correcting === null) return;
    setOverrides((prev) => {
      const next = [...prev];
      next[correcting] = card;
      return next;
    });
    setCorrecting(null);
  }

  // ---- Derived advice -----------------------------------------------------
  const fairShare = 1 / (opponents + 1);
  const potN = Number(potStr);
  const callN = Number(callStr);
  const potOdds =
    callN > 0 && Number.isFinite(potN) && Number.isFinite(callN)
      ? callN / (potN + callN)
      : null;

  let verdict = "";
  let verdictColor = "text-slate-200";
  if (equity !== null) {
    if (potOdds !== null) {
      if (equity >= potOdds + 0.03) {
        verdict = `Call — ${pct(equity)} beats the ${pct(potOdds)} you need`;
        verdictColor = "text-emerald-300";
      } else {
        verdict = `Fold — ${pct(equity)} is below the ${pct(potOdds)} you need`;
        verdictColor = "text-red-300";
      }
    } else {
      const ratio = equity / fairShare;
      if (ratio >= 1.25) {
        verdict = "Ahead of the field — get money in";
        verdictColor = "text-emerald-300";
      } else if (ratio >= 0.95) {
        verdict = "Roughly a coin flip";
        verdictColor = "text-amber-200";
      } else {
        verdict = "Behind — proceed with caution";
        verdictColor = "text-red-300";
      }
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-3 pb-8 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">📷 Live Scanner</h1>
          <p className="text-xs text-muted">reads your shared screen · beta</p>
        </div>
        <Link
          href="/"
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          ← Table mode
        </Link>
      </header>

      {!supported && (
        <p className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
          Screen capture needs desktop Chrome or Edge.
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}

      {phase === "idle" ? (
        <div className="rounded-2xl bg-surface/70 p-4 ring-1 ring-white/10">
          <p className="text-sm text-muted">
            Share the window that shows your poker table (e.g. your Discord
            screen-share), then calibrate once by boxing your cards. The scanner
            reads your hole cards and the board and shows your live equity.
          </p>
          <button
            type="button"
            onClick={start}
            disabled={!supported}
            className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 disabled:opacity-40 active:scale-[0.99]"
          >
            Start screen capture
          </button>
        </div>
      ) : (
        <>
          {/* Live capture preview + calibration surface */}
          <div className="relative overflow-hidden rounded-xl ring-1 ring-white/15">
            <canvas
              ref={dispRef}
              className="block w-full cursor-crosshair"
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
            />
          </div>

          {phase === "calibrating" && (
            <div className="mt-3 rounded-2xl bg-surface-2/80 p-4 text-center ring-1 ring-white/15">
              <div className="text-xs uppercase tracking-wide text-accent">
                Calibration {calibStep + 1} / 3
              </div>
              <div className="mt-1 font-semibold">{CALIB_STEPS[calibStep]}</div>
              <p className="mt-1 text-xs text-muted">
                Click-drag a rectangle on the preview above.
              </p>
            </div>
          )}

          {phase === "scanning" && (
            <>
              <section className="mt-3 rounded-2xl bg-surface/70 p-3 ring-1 ring-white/10">
                <div className="flex items-center justify-between">
                  <Label>Detected — tap a card to fix</Label>
                  <button
                    type="button"
                    onClick={newHand}
                    className="text-xs text-muted underline-offset-2 hover:underline"
                  >
                    new hand
                  </button>
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="flex gap-1.5">
                    {[0, 1].map((i) => (
                      <DetectedCard
                        key={i}
                        guess={guesses[i]}
                        override={overrides[i]}
                        card={effectiveCard(i)}
                        onClick={() => setCorrecting(i)}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {[2, 3, 4, 5, 6].map((i) => (
                      <DetectedCard
                        key={i}
                        guess={guesses[i]}
                        override={overrides[i]}
                        card={effectiveCard(i)}
                        onClick={() => setCorrecting(i)}
                      />
                    ))}
                  </div>
                </div>
              </section>

              <section className="mt-3 rounded-2xl bg-surface/70 p-3 ring-1 ring-white/10">
                <Label>Opponents still in</Label>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Chip key={n} active={opponents === n} onClick={() => setOpponents(n)}>
                      {n}
                    </Chip>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Money label="Pot (optional)" value={potStr} onChange={setPotStr} />
                  <Money label="To call (optional)" value={callStr} onChange={setCallStr} />
                </div>
              </section>

              <section className="mt-3 rounded-2xl bg-surface-2/85 p-4 text-center ring-1 ring-white/15">
                {holeCards.length === 2 ? (
                  <>
                    <div className="text-xs uppercase tracking-wide text-muted">
                      Equity vs {opponents} opp{opponents === 1 ? "" : "s"}
                    </div>
                    <div className="text-4xl font-extrabold text-emerald-300">
                      {equity === null ? "…" : pct(equity)}
                    </div>
                    <div className={`mt-1 text-sm font-semibold ${verdictColor}`}>
                      {verdict}
                    </div>
                    {potOdds !== null && (
                      <div className="mt-1 text-xs text-muted">
                        pot odds: need {pct(potOdds)} to call
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted">
                    Waiting to read your 2 hole cards… if they&apos;re wrong, tap
                    to fix or re-calibrate.
                  </p>
                )}
              </section>
            </>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={recalibrate}
              className="rounded-lg bg-white/10 py-2 text-sm font-semibold hover:bg-white/15"
            >
              Re-calibrate
            </button>
            <button
              type="button"
              onClick={stopAll}
              className="rounded-lg bg-red-500/20 py-2 text-sm font-semibold text-red-200 hover:bg-red-500/30"
            >
              Stop capture
            </button>
          </div>
        </>
      )}

      {/* hidden video source */}
      <video ref={videoRef} className="hidden" muted playsInline />

      {correcting !== null && (
        <CardPickerModal
          used={usedIds}
          canClear={effectiveCard(correcting) !== null}
          onPick={applyCorrection}
          onClear={() => applyCorrection(null)}
          onClose={() => setCorrecting(null)}
        />
      )}
    </main>
  );
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function DetectedCard({
  guess,
  override,
  card,
  onClick,
}: {
  guess: CardGuess | undefined;
  override: Card | null | undefined;
  card: Card | null;
  onClick: () => void;
}) {
  const lowConf = override === undefined && guess && guess.card && guess.confidence < 0.6;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <CardSlot card={card} size="sm" onClick={onClick} label="detected card" />
      <span
        className={`text-[9px] ${
          override !== undefined
            ? "text-accent"
            : lowConf
              ? "text-amber-300"
              : "text-white/40"
        }`}
      >
        {override !== undefined ? "fixed" : lowConf ? "check?" : guess?.card ? "ok" : "—"}
      </span>
    </div>
  );
}

function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/10 focus-within:ring-accent/60">
        <span className="text-muted">$</span>
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent py-1.5 pl-1 text-sm font-semibold outline-none"
        />
      </div>
    </label>
  );
}
