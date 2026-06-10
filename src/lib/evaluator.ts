// Fast 7-card hand evaluator for Texas Hold'em.
//
// evaluate7 returns a single comparable integer: a higher number is a better
// poker hand. The integer encodes the hand category in the high digits and up
// to five kicker ranks in base-16 below it, so two scores can be compared
// directly to determine the winner (equal scores => tie / split pot).

import type { Card } from "./cards";

export const HAND_CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const;

export const CATEGORY_NAMES: Record<number, string> = {
  0: "High Card",
  1: "Pair",
  2: "Two Pair",
  3: "Three of a Kind",
  4: "Straight",
  5: "Flush",
  6: "Full House",
  7: "Four of a Kind",
  8: "Straight Flush",
};

/** Encode a category + ordered kickers into one comparable integer. */
function score(category: number, kickers: number[]): number {
  let s = category;
  for (let i = 0; i < 5; i++) {
    s = s * 16 + (kickers[i] ?? 0);
  }
  return s;
}

/** Category portion of a score (0..8). */
export function categoryOf(scoreValue: number): number {
  return Math.floor(scoreValue / 16 ** 5);
}

/**
 * Highest card of the best straight contained in `ranks`, or 0 if none.
 * Treats an Ace (14) as also low (1) to allow the wheel A-2-3-4-5.
 */
function straightHigh(ranks: number[]): number {
  const present = new Array(15).fill(false);
  for (const r of ranks) present[r] = true;
  if (present[14]) present[1] = true; // ace plays low
  let run = 0;
  for (let r = 14; r >= 1; r--) {
    if (present[r]) {
      run++;
      if (run >= 5) return r + 4; // r is the bottom of a 5-card run
    } else {
      run = 0;
    }
  }
  return 0;
}

/** Top `n` distinct ranks (desc) present in rankCount, skipping excluded ranks. */
function topRanks(
  rankCount: number[],
  exclude: Set<number>,
  n: number,
): number[] {
  const res: number[] = [];
  for (let r = 14; r >= 2 && res.length < n; r--) {
    if (rankCount[r] > 0 && !exclude.has(r)) res.push(r);
  }
  return res;
}

/**
 * Evaluate the best 5-card hand out of 5..7 cards.
 * Returns a comparable integer (higher = better).
 */
export function evaluate7(cards: Card[]): number {
  const rankCount = new Array(15).fill(0);
  const suitCount = new Array(4).fill(0);
  const suitedRanks: number[][] = [[], [], [], []];

  for (const c of cards) {
    rankCount[c.rank]++;
    suitCount[c.suit]++;
    suitedRanks[c.suit].push(c.rank);
  }

  // --- Straight flush ---
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) flushSuit = s;
  }
  if (flushSuit >= 0) {
    const sfHigh = straightHigh(suitedRanks[flushSuit]);
    if (sfHigh > 0) return score(HAND_CATEGORY.STRAIGHT_FLUSH, [sfHigh]);
  }

  // Group ranks by how many times they appear.
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (rankCount[r] === 4) quads.push(r);
    else if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
  }

  // --- Four of a kind ---
  if (quads.length > 0) {
    const quad = quads[0];
    const kicker = topRanks(rankCount, new Set([quad]), 1);
    return score(HAND_CATEGORY.QUADS, [quad, kicker[0]]);
  }

  // --- Full house (trips + another trip or a pair) ---
  if (trips.length >= 1 && (trips.length >= 2 || pairs.length >= 1)) {
    const trip = trips[0];
    const pairCandidate = Math.max(
      trips.length >= 2 ? trips[1] : 0,
      pairs.length >= 1 ? pairs[0] : 0,
    );
    return score(HAND_CATEGORY.FULL_HOUSE, [trip, pairCandidate]);
  }

  // --- Flush ---
  if (flushSuit >= 0) {
    const top5 = [...suitedRanks[flushSuit]].sort((a, b) => b - a).slice(0, 5);
    return score(HAND_CATEGORY.FLUSH, top5);
  }

  // --- Straight ---
  const allRanks: number[] = [];
  for (let r = 2; r <= 14; r++) if (rankCount[r] > 0) allRanks.push(r);
  const sHigh = straightHigh(allRanks);
  if (sHigh > 0) return score(HAND_CATEGORY.STRAIGHT, [sHigh]);

  // --- Three of a kind ---
  if (trips.length >= 1) {
    const trip = trips[0];
    const kickers = topRanks(rankCount, new Set([trip]), 2);
    return score(HAND_CATEGORY.TRIPS, [trip, ...kickers]);
  }

  // --- Two pair ---
  if (pairs.length >= 2) {
    const [p1, p2] = pairs;
    const kicker = topRanks(rankCount, new Set([p1, p2]), 1);
    return score(HAND_CATEGORY.TWO_PAIR, [p1, p2, kicker[0]]);
  }

  // --- One pair ---
  if (pairs.length === 1) {
    const p = pairs[0];
    const kickers = topRanks(rankCount, new Set([p]), 3);
    return score(HAND_CATEGORY.PAIR, [p, ...kickers]);
  }

  // --- High card ---
  const top5 = topRanks(rankCount, new Set(), 5);
  return score(HAND_CATEGORY.HIGH_CARD, top5);
}
