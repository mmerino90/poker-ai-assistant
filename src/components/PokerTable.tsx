"use client";

import type { Card } from "@/lib/cards";
import { type HandState, seatRoles } from "@/lib/handState";
import { CardSlot } from "./CardPicker";

// Position each seat around an ellipse, with the hero anchored at the bottom.
const RX = 40; // horizontal radius (% of width)
const RY = 39; // vertical radius (% of height)

function seatPos(rel: number, n: number): { left: string; top: string } {
  const angle = (90 + (rel * 360) / n) * (Math.PI / 180);
  return {
    left: `${50 + RX * Math.cos(angle)}%`,
    top: `${50 + RY * Math.sin(angle)}%`,
  };
}

const ROLE_STYLE: Record<string, string> = {
  D: "bg-white text-slate-900",
  SB: "bg-sky-400/80 text-slate-900",
  BB: "bg-amber-400/80 text-slate-900",
};

export function PokerTable({
  hand,
  hole,
  board,
  interactiveBoardCount,
  pot,
  onPickHole,
  onPickBoard,
}: {
  hand: HandState;
  hole: (Card | null)[];
  board: (Card | null)[];
  interactiveBoardCount: number;
  pot: number;
  onPickHole: (i: number) => void;
  onPickBoard: (i: number) => void;
}) {
  const n = hand.players.length;

  return (
    <div className="relative mx-auto h-[58vh] max-h-[540px] min-h-[420px] w-full">
      {/* Felt */}
      <div className="absolute inset-x-2 inset-y-6 rounded-[48%] border-[6px] border-amber-950/60 bg-[radial-gradient(circle_at_50%_40%,#157a59,#0c4d39_70%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.5)]" />

      {/* Center: pot + board */}
      <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="rounded-full bg-black/35 px-3 py-1 text-center">
          <span className="text-[10px] uppercase tracking-wide text-white/60">
            Pot{" "}
          </span>
          <span className="text-sm font-extrabold text-accent">${pot}</span>
        </div>
        <div className="flex gap-1">
          {board.map((c, i) => {
            const interactive = i < interactiveBoardCount;
            return (
              <div
                key={i}
                className={interactive ? "" : "pointer-events-none opacity-25"}
              >
                <CardSlot
                  card={c}
                  size="sm"
                  label={`Board card ${i + 1}`}
                  onClick={() => interactive && onPickBoard(i)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Seats */}
      {hand.players.map((p) => {
        const rel = (p.id - hand.heroId + n) % n;
        const pos = seatPos(rel, n);
        const toAct = hand.toActId === p.id;
        const roles = seatRoles(hand, p.id);
        const folded = p.status === "folded";
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={pos}
          >
            <div
              className={`flex w-[5.2rem] flex-col items-center rounded-xl px-1.5 py-1 text-center ring-1 transition ${
                toAct
                  ? "bg-accent/20 ring-accent"
                  : folded
                    ? "bg-black/40 opacity-50 ring-white/10"
                    : "bg-slate-900/70 ring-white/15"
              }`}
            >
              <div className="flex items-center gap-1">
                <span className="truncate text-xs font-bold">{p.label}</span>
                {roles.map((r) => (
                  <span
                    key={r}
                    className={`rounded px-1 text-[8px] font-bold leading-tight ${ROLE_STYLE[r]}`}
                  >
                    {r}
                  </span>
                ))}
              </div>
              <div className="text-[11px] font-semibold tabular-nums text-emerald-300">
                ${p.stack}
              </div>
              {p.status === "allin" ? (
                <div className="text-[9px] font-bold text-fuchsia-300">
                  ALL-IN
                </div>
              ) : folded ? (
                <div className="text-[9px] text-white/50">folded</div>
              ) : p.committedRound > 0 ? (
                <div className="mt-0.5 rounded-full bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-200">
                  ${p.committedRound}
                </div>
              ) : null}

              {/* Hero's hole cards live on the hero seat. */}
              {p.isHero && (
                <div className="mt-1 flex gap-1">
                  {hole.map((c, i) => (
                    <CardSlot
                      key={i}
                      card={c}
                      size="sm"
                      label={`Your card ${i + 1}`}
                      onClick={() => onPickHole(i)}
                    />
                  ))}
                </div>
              )}
            </div>
            {toAct && (
              <div className="mt-0.5 text-center text-[9px] font-bold text-accent">
                ▲ to act
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
