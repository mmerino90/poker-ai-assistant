// Hand state machine for a No-Limit Hold'em table.
//
// This models the real game so the UI doesn't ask you to compute anything: you
// set blinds + stacks once and log what each player does, and this derives the
// pot, the amount you must call, who's left in the hand, and your position —
// exactly the inputs the decision engine needs.
//
// Blinds are assigned explicitly (any seat can be the dealer / SB / BB), so the
// action order is derived generically:
//   - pre-flop: first to act is left of the big blind
//   - post-flop: first to act is left of the dealer button
//
// Scope note: this tracks the main pot only (no exact side-pot accounting). For
// live advice that's fine — equity only needs the count of opponents still in.

import type { Card } from "./cards";
import type { Position } from "./decision";

export type PlayerStatus = "active" | "folded" | "allin";

export type Player = {
  id: number; // stable seat index 0..N-1, clockwise
  label: string; // "You", "P2", ...
  isHero: boolean;
  stack: number; // chips behind (not yet committed)
  committedRound: number; // chips put in during the current betting round
  committedHand: number; // chips put in across the whole hand
  status: PlayerStatus;
  hasActedThisRound: boolean;
};

export type Street = "preflop" | "flop" | "turn" | "river";

export type HandConfig = {
  buttonId: number;
  sbId: number;
  bbId: number;
  sb: number; // small blind amount
  bb: number; // big blind amount
};

export type HandState = {
  players: Player[];
  buttonId: number;
  sbId: number;
  bbId: number;
  sb: number;
  bb: number;
  street: Street;
  board: Card[];
  currentBet: number; // highest committedRound this street
  lastRaiseTo: number; // size of the last full bet/raise "to" (for min-raise hints)
  toActId: number | null; // whose turn; null when the round is complete
  heroId: number;
  settled: boolean; // pot has been awarded
  winners: number[]; // seat ids that won the pot (after settling)
  potWon: number; // chips awarded when settled
};

export type PlayerSetup = { label: string; stack: number; isHero?: boolean };

const STREET_ORDER: Street[] = ["preflop", "flop", "turn", "river"];

function clone(h: HandState): HandState {
  return {
    ...h,
    players: h.players.map((p) => ({ ...p })),
    board: [...h.board],
    winners: [...h.winners],
  };
}

/** Clockwise: first seat index >= start (wrapping) matching `ok`. */
function findSeat(
  players: Player[],
  start: number,
  ok: (p: Player) => boolean,
): number | null {
  const n = players.length;
  for (let i = 0; i < n; i++) {
    const idx = (start + i) % n;
    if (ok(players[idx])) return idx;
  }
  return null;
}

/** Commit `amount` chips from a player into the pot, flagging all-in. */
function commit(p: Player, amount: number) {
  const real = Math.min(amount, p.stack);
  p.stack -= real;
  p.committedRound += real;
  p.committedHand += real;
  if (p.stack === 0) p.status = "allin";
}

/** Start a new hand: seat players, post blinds, set the first actor. */
export function startHand(
  setups: PlayerSetup[],
  cfg: HandConfig,
): HandState {
  const n = setups.length;
  if (n < 2 || n > 6) throw new Error("Need 2–6 players");

  const players: Player[] = setups.map((s, i) => ({
    id: i,
    label: s.label,
    isHero: !!s.isHero,
    stack: s.stack,
    committedRound: 0,
    committedHand: 0,
    status: "active",
    hasActedThisRound: false,
  }));

  const heroId = players.findIndex((p) => p.isHero);

  const h: HandState = {
    players,
    buttonId: cfg.buttonId,
    sbId: cfg.sbId,
    bbId: cfg.bbId,
    sb: cfg.sb,
    bb: cfg.bb,
    street: "preflop",
    board: [],
    currentBet: 0,
    lastRaiseTo: cfg.bb,
    toActId: null,
    heroId: heroId === -1 ? 0 : heroId,
    settled: false,
    winners: [],
    potWon: 0,
  };

  // Post blinds.
  commit(players[cfg.sbId], cfg.sb);
  commit(players[cfg.bbId], cfg.bb);
  h.currentBet = Math.max(cfg.sb, cfg.bb);

  // Pre-flop, first to act is the player left of the big blind.
  h.toActId = findSeat(players, (cfg.bbId + 1) % n, (p) => p.status === "active");
  return h;
}

/** Players still contesting the pot (not folded), including all-ins and hero. */
export function playersInHand(h: HandState): number {
  return h.players.filter((p) => p.status !== "folded").length;
}

function nonFolded(h: HandState): Player[] {
  return h.players.filter((p) => p.status !== "folded");
}

/** Find the next player who still needs to act this round, or null. */
function nextActor(h: HandState, fromId: number): number | null {
  const n = h.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (fromId + i) % n;
    const p = h.players[idx];
    if (
      p.status === "active" &&
      (!p.hasActedThisRound || p.committedRound < h.currentBet)
    ) {
      return idx;
    }
  }
  return null;
}

export type Action =
  | { type: "fold" }
  | { type: "check" }
  | { type: "call" }
  | { type: "bet"; to: number } // open bet: total chips in front after the action
  | { type: "raise"; to: number };

export type LegalActions = {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number; // chips to add to call (capped at stack)
  canBet: boolean; // open bet (no bet yet)
  canRaise: boolean; // raise (a bet exists)
  minBetTo: number; // suggested minimum "to" amount
  maxBetTo: number; // all-in "to" amount
};

/** What the player to act may legally do. */
export function legalActions(h: HandState): LegalActions | null {
  if (h.toActId === null) return null;
  const p = h.players[h.toActId];
  const toCall = Math.max(0, h.currentBet - p.committedRound);
  const callAmount = Math.min(toCall, p.stack);
  const facingBet = toCall > 0;
  const minRaiseIncrement = Math.max(h.bb, h.lastRaiseTo - h.currentBet || h.bb);
  const maxBetTo = p.committedRound + p.stack;
  const minBetTo = facingBet
    ? Math.min(h.currentBet + minRaiseIncrement, maxBetTo)
    : Math.min(Math.max(h.bb, h.currentBet + h.bb), maxBetTo);
  return {
    canFold: true,
    canCheck: !facingBet,
    canCall: facingBet && p.stack > 0,
    callAmount,
    canBet: !facingBet && p.stack > 0,
    canRaise: facingBet && p.stack > callAmount,
    minBetTo,
    maxBetTo,
  };
}

/** Apply an action by the player currently to act. Returns a new state. */
export function applyAction(state: HandState, action: Action): HandState {
  if (state.toActId === null) throw new Error("Betting round is complete");
  const h = clone(state);
  const actorId = state.toActId;
  const p = h.players[actorId];
  p.hasActedThisRound = true;

  switch (action.type) {
    case "fold":
      p.status = "folded";
      break;
    case "check":
      if (h.currentBet - p.committedRound > 0) {
        throw new Error("Cannot check facing a bet");
      }
      break;
    case "call": {
      const toCall = h.currentBet - p.committedRound;
      commit(p, toCall);
      break;
    }
    case "bet":
    case "raise": {
      const target = action.to;
      if (target <= h.currentBet && h.currentBet > 0) {
        throw new Error("A raise must exceed the current bet");
      }
      const add = target - p.committedRound;
      if (add <= 0) throw new Error("Invalid bet amount");
      commit(p, add);
      if (p.committedRound > h.currentBet) {
        h.lastRaiseTo = p.committedRound;
        h.currentBet = p.committedRound;
        for (const other of h.players) {
          if (other.id !== actorId && other.status === "active") {
            other.hasActedThisRound = false;
          }
        }
      }
      break;
    }
  }

  if (nonFolded(h).length === 1) {
    h.toActId = null;
    return h;
  }

  h.toActId = nextActor(h, actorId);
  return h;
}

/** True when the current betting round is finished. */
export function isRoundComplete(h: HandState): boolean {
  return h.toActId === null;
}

/** True when no further betting is possible (one player left, or river done). */
export function isHandComplete(h: HandState): boolean {
  if (nonFolded(h).length === 1) return true;
  if (h.street === "river" && isRoundComplete(h)) return true;
  return false;
}

function actionableCount(h: HandState): number {
  return h.players.filter((p) => p.status === "active" && p.stack > 0).length;
}

/** Advance to the next street, dealing the given community cards. */
export function advanceStreet(state: HandState, board: Card[]): HandState {
  if (!isRoundComplete(state)) {
    throw new Error("Finish the betting round before dealing the next street");
  }
  if (state.street === "river") throw new Error("Hand is already at the river");
  const h = clone(state);
  h.board = [...board];
  h.street = STREET_ORDER[STREET_ORDER.indexOf(h.street) + 1];
  h.currentBet = 0;
  h.lastRaiseTo = h.bb;
  for (const p of h.players) {
    p.committedRound = 0;
    p.hasActedThisRound = false;
  }
  // First to act post-flop is the first active player left of the button.
  h.toActId = findSeat(
    h.players,
    (h.buttonId + 1) % h.players.length,
    (p) => p.status === "active",
  );
  if (actionableCount(h) === 0) h.toActId = null;
  return h;
}

/** Players eligible to be declared the winner (still in the hand). */
export function showdownCandidates(h: HandState): Player[] {
  return nonFolded(h);
}

/**
 * Award the pot to the given winner seat ids (split evenly on a tie). Updates
 * stacks, clears the committed chips (pot moves out of the middle), and records
 * the result.
 */
export function settleHand(state: HandState, winnerIds: number[]): HandState {
  if (winnerIds.length === 0) throw new Error("Pick at least one winner");
  const h = clone(state);
  const pot = h.players.reduce((sum, p) => sum + p.committedHand, 0);
  const share = Math.floor(pot / winnerIds.length);
  let remainder = pot - share * winnerIds.length;
  for (const id of winnerIds) {
    h.players[id].stack += share;
    if (remainder > 0) {
      h.players[id].stack += 1;
      remainder--;
    }
  }
  for (const p of h.players) {
    p.committedRound = 0;
    p.committedHand = 0;
  }
  h.settled = true;
  h.winners = [...winnerIds];
  h.potWon = pot;
  h.toActId = null;
  return h;
}

export type HeroContext = {
  pot: number; // total chips in the middle (all players' committedHand)
  toCall: number; // chips hero must add to call
  playersInHand: number;
  position: Position;
  stack: number; // hero chips behind
  isHeroTurn: boolean;
};

function heroPosition(h: HandState): Position {
  const hero = h.heroId;
  if (hero === h.buttonId) return "button";
  if (hero === h.sbId || hero === h.bbId) return "blinds";
  return "middle";
}

/** Everything the decision engine needs, derived from the live table. */
export function heroContext(h: HandState): HeroContext {
  const pot = h.players.reduce((sum, p) => sum + p.committedHand, 0);
  const hero = h.players[h.heroId];
  const toCall = Math.min(
    Math.max(0, h.currentBet - hero.committedRound),
    hero.stack,
  );
  return {
    pot,
    toCall,
    playersInHand: playersInHand(h),
    position: heroPosition(h),
    stack: hero.stack,
    isHeroTurn: h.toActId === h.heroId,
  };
}

/** Role tags for a seat: any of D (dealer), SB, BB — for display. */
export function seatRoles(h: HandState, id: number): string[] {
  const roles: string[] = [];
  if (id === h.buttonId) roles.push("D");
  if (id === h.sbId) roles.push("SB");
  if (id === h.bbId) roles.push("BB");
  return roles;
}
