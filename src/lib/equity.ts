// Monte Carlo equity: estimate the chance your hand wins at showdown against
// a number of unknown ("any two cards") opponents, given the cards you can see.
//
// This is the part of the original Gongsta/Poker-AI idea that transfers cleanly
// to 3+ players: equity is well-defined for any number of opponents, unlike a
// heads-up CFR blueprint.

import { type Card, cardId, fullDeck } from "./cards";
import { evaluate7 } from "./evaluator";

export type EquityResult = {
  equity: number; // 0..1, expected share of the pot at showdown
  win: number; // fraction of trials won outright
  tie: number; // fraction of trials tied (split with >=1 opponent)
  lose: number; // fraction of trials lost
  iterations: number;
};

/**
 * Estimate hero equity vs `numOpponents` random hands.
 *
 * @param hole       Hero's 2 hole cards.
 * @param board      0, 3, 4, or 5 community cards already dealt.
 * @param numOpponents Opponents still in the hand (>= 1).
 * @param iterations Monte Carlo trials (default 25k — fast and stable on phones).
 */
export function estimateEquity(
  hole: Card[],
  board: Card[],
  numOpponents: number,
  iterations = 25000,
): EquityResult {
  if (hole.length !== 2) {
    throw new Error("Hero must have exactly 2 hole cards");
  }
  if (numOpponents < 1) {
    throw new Error("Need at least 1 opponent");
  }

  const known = [...hole, ...board];
  const knownIds = new Set(known.map(cardId));
  // Remaining cards we can draw from.
  const deck = fullDeck().filter((c) => !knownIds.has(cardId(c)));

  const boardNeeded = 5 - board.length;
  const drawCount = numOpponents * 2 + boardNeeded;

  if (drawCount > deck.length) {
    throw new Error("Not enough cards left for that many opponents");
  }

  let winPoints = 0; // accumulates equity (1 for a win, 1/(k+1) for a k-way tie)
  let wins = 0;
  let ties = 0;
  let losses = 0;

  // Scratch buffers reused across trials to avoid per-iteration allocation.
  const heroSeven: Card[] = [hole[0], hole[1], ...board, ...new Array(boardNeeded).fill(null)];
  const oppSeven: Card[] = new Array(7).fill(null);

  for (let it = 0; it < iterations; it++) {
    // Partial Fisher–Yates: draw the first `drawCount` cards of a shuffle.
    for (let i = 0; i < drawCount; i++) {
      const j = i + Math.floor(Math.random() * (deck.length - i));
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }

    // Fill the rest of the board for hero.
    for (let i = 0; i < boardNeeded; i++) {
      heroSeven[2 + board.length + i] = deck[i];
    }
    const heroScore = evaluate7(heroSeven);

    // Compare against each opponent; track how many beat or tie hero.
    let beaten = false;
    let tiedWith = 0;
    let cursor = boardNeeded; // opponent hole cards start after the shared board
    for (let o = 0; o < numOpponents; o++) {
      oppSeven[0] = deck[cursor];
      oppSeven[1] = deck[cursor + 1];
      cursor += 2;
      for (let i = 0; i < 5; i++) {
        // shared community: existing board + the boardNeeded drawn cards
        oppSeven[2 + i] =
          i < board.length ? board[i] : deck[i - board.length];
      }
      const oppScore = evaluate7(oppSeven);
      if (oppScore > heroScore) {
        beaten = true;
        break;
      } else if (oppScore === heroScore) {
        tiedWith++;
      }
    }

    if (beaten) {
      losses++;
    } else if (tiedWith > 0) {
      ties++;
      winPoints += 1 / (tiedWith + 1);
    } else {
      wins++;
      winPoints += 1;
    }
  }

  return {
    equity: winPoints / iterations,
    win: wins / iterations,
    tie: ties / iterations,
    lose: losses / iterations,
    iterations,
  };
}
