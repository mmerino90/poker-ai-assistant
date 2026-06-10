"use client";

import { useState } from "react";
import {
  type Card,
  RANKS,
  SUITS,
  RANK_CHARS,
  SUIT_SYMBOLS,
  cardId,
} from "@/lib/cards";

const RED_SUITS = new Set([1, 2]); // hearts, diamonds

function suitColor(suit: number): string {
  return RED_SUITS.has(suit) ? "text-red-600" : "text-slate-900";
}

/** A single tappable slot showing a chosen card or an empty placeholder. */
export function CardSlot({
  card,
  onClick,
  label,
  size = "md",
}: {
  card: Card | null;
  onClick: () => void;
  label?: string;
  size?: "md" | "sm";
}) {
  const dims =
    size === "sm" ? "h-12 w-9 text-base" : "h-16 w-12 text-xl";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex items-center justify-center rounded-lg border-2 font-bold shadow-sm transition active:scale-95 ${dims} ${
        card
          ? "border-white/30 bg-white"
          : "border-dashed border-white/40 bg-white/5 text-white/50"
      }`}
    >
      {card ? (
        <span className={suitColor(card.suit)}>
          {RANK_CHARS[card.rank]}
          {SUIT_SYMBOLS[card.suit]}
        </span>
      ) : (
        <span className="leading-none">+</span>
      )}
    </button>
  );
}

/**
 * Modal grid for picking a card. Cards already in use elsewhere are disabled.
 * Calls onPick with the chosen card, or onClear to empty the slot.
 */
export function CardPickerModal({
  used,
  onPick,
  onClear,
  onClose,
  canClear,
}: {
  used: Set<number>;
  onPick: (card: Card) => void;
  onClear: () => void;
  onClose: () => void;
  canClear: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface-2 p-4 shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pick a card</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-2">
          {SUITS.map((suit) => (
            <div key={suit} className="flex items-center gap-1.5">
              <span
                className={`w-6 shrink-0 text-center text-xl ${
                  RED_SUITS.has(suit) ? "text-red-400" : "text-white"
                }`}
              >
                {SUIT_SYMBOLS[suit]}
              </span>
              <div className="grid grow grid-cols-7 gap-1">
                {RANKS.map((rank) => {
                  const card = { rank, suit };
                  const disabled = used.has(cardId(card));
                  return (
                    <button
                      key={rank}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPick(card)}
                      className={`flex h-9 items-center justify-center rounded-md text-sm font-bold transition active:scale-95 ${
                        disabled
                          ? "cursor-not-allowed bg-white/5 text-white/20"
                          : "bg-white text-slate-900 hover:bg-amber-100"
                      } ${!disabled ? suitColor(suit) : ""}`}
                    >
                      {RANK_CHARS[rank]}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {canClear && (
          <button
            type="button"
            onClick={onClear}
            className="mt-4 w-full rounded-lg border border-white/20 py-2 text-sm text-muted hover:bg-white/5"
          >
            Clear this card
          </button>
        )}
      </div>
    </div>
  );
}

/** Small hook-free helper to manage a target slot for the modal. */
export type SlotTarget =
  | { kind: "hole"; index: number }
  | { kind: "board"; index: number }
  | null;

export function useSlotTarget() {
  const [target, setTarget] = useState<SlotTarget>(null);
  return { target, setTarget };
}
