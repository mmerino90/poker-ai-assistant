// Decision engine: turn equity + pot odds + position + stack depth into a
// concrete recommendation (fold / check / call / bet / raise / all-in) with
// the key numbers behind it.
//
// This is an honest heuristic, not a solved 3-player strategy. The logic:
//   - Calling is driven by pot odds: continue only when your equity beats the
//     price you're being asked to pay (plus a buffer for multiway / future
//     streets).
//   - Raising/betting for value is driven by how far ahead of your "fair
//     share" of equity you are (1 / players-in-hand).
//   - Position nudges the thresholds: looser in position, tighter out of it.

import type { Card } from "./cards";
import { estimateEquity, type EquityResult } from "./equity";

export type Position = "button" | "middle" | "blinds";
export type Street = "preflop" | "flop" | "turn" | "river";
export type ActionType =
  | "Fold"
  | "Check"
  | "Call"
  | "Bet"
  | "Raise"
  | "All-in";

export type DecisionInput = {
  hole: Card[];
  board: Card[];
  playersInHand: number; // total players still in the hand, including you
  position: Position;
  pot: number; // chips in the pot before your action
  toCall: number; // chips you must add to call (0 if you can check)
  stack: number; // your remaining chips
  iterations?: number; // Monte Carlo trials (default 15k for snappy UI)
};

export type Decision = {
  action: ActionType;
  amount?: number; // for Bet/Raise/All-in: total chips to put in on this action
  street: Street;
  equity: EquityResult;
  potOdds: number | null; // equity needed to break even on a call, or null if checking
  fairShare: number; // 1 / playersInHand
  strength: string; // human label: "very strong" ... "weak"
  reasons: string[]; // key numbers + short rationale, in display order
};

// --- Tunable constants -------------------------------------------------------
const RAISE_RATIO = 1.45; // equity/fairShare needed to raise for value
const BET_RATIO = 1.25; // equity/fairShare needed to bet when checked to
const RAISE_FRACTION = 0.7; // raise size as a fraction of (pot + call)
const BET_FRACTION = 0.62; // bet size as a fraction of the pot

// Position multipliers applied to the value thresholds.
const POSITION_FACTOR: Record<Position, number> = {
  button: 0.92, // in position: value-bet/raise a touch wider
  middle: 1.0,
  blinds: 1.07, // out of position: tighten up
};

function streetOf(board: Card[]): Street {
  switch (board.length) {
    case 0:
      return "preflop";
    case 3:
      return "flop";
    case 4:
      return "turn";
    case 5:
      return "river";
    default:
      throw new Error(`Invalid board size: ${board.length}`);
  }
}

// Buffer added to pot odds before we'll call: protects against multiway pots
// and reverse-implied odds on early streets (your equity is "softer" early).
function callBuffer(street: Street, opponents: number): number {
  const multiway = Math.max(0, opponents - 1) * 0.02;
  const earlyStreet =
    street === "preflop" ? 0.04 : street === "flop" ? 0.025 : street === "turn" ? 0.01 : 0;
  return multiway + earlyStreet;
}

function strengthLabel(valueRatio: number): string {
  if (valueRatio >= 1.7) return "very strong";
  if (valueRatio >= RAISE_RATIO) return "strong";
  if (valueRatio >= 1.15) return "ahead";
  if (valueRatio >= 0.9) return "marginal";
  return "weak";
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function positionNote(position: Position): string {
  switch (position) {
    case "button":
      return "In position (button) — you act last, so you can play a bit wider.";
    case "blinds":
      return "Out of position (blinds) — you act first post-flop, so play tighter.";
    case "middle":
      return "Middle position — neutral.";
  }
}

/** Clamp a chips amount to a whole number within [min, stack]. */
function sizeBet(raw: number, stack: number, min: number): {
  amount: number;
  allIn: boolean;
} {
  let amount = Math.round(raw);
  if (amount < min) amount = min;
  if (amount >= stack) return { amount: stack, allIn: true };
  return { amount, allIn: false };
}

export function recommend(input: DecisionInput): Decision {
  const {
    hole,
    board,
    playersInHand,
    position,
    pot,
    toCall,
    stack,
    iterations = 15000,
  } = input;

  if (playersInHand < 2) throw new Error("Need at least 2 players in the hand");
  const opponents = playersInHand - 1;
  const street = streetOf(board);
  const fairShare = 1 / playersInHand;
  const posFactor = POSITION_FACTOR[position];

  const equity = estimateEquity(hole, board, opponents, iterations);
  const valueRatio = equity.equity / fairShare;
  const strength = strengthLabel(valueRatio);

  const reasons: string[] = [];
  reasons.push(
    `Equity: ${pct(equity.equity)} to win at showdown vs ${opponents} opponent${
      opponents === 1 ? "" : "s"
    }.`,
  );
  reasons.push(
    `Your fair share with ${playersInHand} players is ${pct(
      fairShare,
    )} — you're ${strength} (${valueRatio.toFixed(2)}× fair share).`,
  );

  const facingBet = toCall > 0;
  const potOdds = facingBet ? toCall / (pot + toCall) : null;

  // --- Facing a bet: call/raise/fold driven by pot odds -------------------
  if (facingBet && potOdds !== null) {
    reasons.push(
      `Pot odds: you must call ${toCall} to win ${pot} — you need ${pct(
        potOdds,
      )} equity to break even.`,
    );

    const buffer = callBuffer(street, opponents);
    const profitable = equity.equity >= potOdds + buffer;
    const strong = valueRatio >= RAISE_RATIO * posFactor;

    // If the bet already puts (or nearly puts) you all-in, it's call-or-fold.
    const cannotRaise = toCall >= stack;

    if (!profitable) {
      reasons.push(
        `Your ${pct(equity.equity)} is below the ${pct(
          potOdds + buffer,
        )} you need (price + safety margin) — not worth continuing.`,
      );
      reasons.push(positionNote(position));
      return { action: "Fold", street, equity, potOdds, fairShare, strength, reasons };
    }

    if (strong && !cannotRaise) {
      const { amount, allIn } = sizeBet(
        toCall + (pot + toCall) * RAISE_FRACTION,
        stack,
        toCall * 2,
      );
      reasons.push(
        allIn
          ? `You're well ahead — get it all in for ${amount}.`
          : `You're well ahead of the field — raise to ${amount} for value.`,
      );
      reasons.push(positionNote(position));
      return {
        action: allIn ? "All-in" : "Raise",
        amount,
        street,
        equity,
        potOdds,
        fairShare,
        strength,
        reasons,
      };
    }

    // Profitable but not strong enough to raise → call.
    const allInCall = toCall >= stack;
    reasons.push(
      `${pct(equity.equity)} beats the ${pct(
        potOdds,
      )} you need — calling is profitable${allInCall ? " (all-in)" : ""}.`,
    );
    reasons.push(positionNote(position));
    return {
      action: "Call",
      amount: allInCall ? stack : toCall,
      street,
      equity,
      potOdds,
      fairShare,
      strength,
      reasons,
    };
  }

  // --- No bet to face: bet for value or check -----------------------------
  const strongEnoughToBet = valueRatio >= BET_RATIO * posFactor;
  if (strongEnoughToBet) {
    const minBet = Math.max(1, Math.round(pot * 0.33));
    const { amount, allIn } = sizeBet(pot * BET_FRACTION, stack, minBet);
    reasons.push(
      allIn
        ? `Strong hand and nothing to call — get it in for ${amount}.`
        : `Strong hand and checked to you — bet ${amount} (~${Math.round(
            BET_FRACTION * 100,
          )}% pot) for value.`,
    );
    reasons.push(positionNote(position));
    return {
      action: allIn ? "All-in" : "Bet",
      amount,
      street,
      equity,
      potOdds,
      fairShare,
      strength,
      reasons,
    };
  }

  reasons.push(
    `Not strong enough to bet for value, but it's free to see the next card — check.`,
  );
  reasons.push(positionNote(position));
  return { action: "Check", street, equity, potOdds, fairShare, strength, reasons };
}
