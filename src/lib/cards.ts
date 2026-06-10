// Core card model for No-Limit Texas Hold'em.
// Rank: 2..14 (11=J, 12=Q, 13=K, 14=A). Suit: 0=s, 1=h, 2=d, 3=c.

export type Card = {
  rank: number; // 2..14
  suit: number; // 0..3
};

export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;
export const SUITS = [0, 1, 2, 3] as const;

export const RANK_CHARS: Record<number, string> = {
  2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
  10: "T", 11: "J", 12: "Q", 13: "K", 14: "A",
};

export const SUIT_CHARS: Record<number, string> = {
  0: "s", 1: "h", 2: "d", 3: "c",
};

export const SUIT_SYMBOLS: Record<number, string> = {
  0: "♠", // spade
  1: "♥", // heart
  2: "♦", // diamond
  3: "♣", // club
};

const CHAR_TO_RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

const CHAR_TO_SUIT: Record<string, number> = {
  s: 0, h: 1, d: 2, c: 3,
};

/** Parse a card like "As", "Td", "2c" into a Card. Throws on bad input. */
export function parseCard(str: string): Card {
  if (str.length !== 2) throw new Error(`Invalid card: "${str}"`);
  const rank = CHAR_TO_RANK[str[0].toUpperCase()];
  const suit = CHAR_TO_SUIT[str[1].toLowerCase()];
  if (rank === undefined || suit === undefined) {
    throw new Error(`Invalid card: "${str}"`);
  }
  return { rank, suit };
}

/** Parse a space-separated string of cards, e.g. "As Kd Qh". */
export function parseCards(str: string): Card[] {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(parseCard);
}

/** Render a card as a 2-char code like "As". */
export function cardToString(card: Card): string {
  return RANK_CHARS[card.rank] + SUIT_CHARS[card.suit];
}

/** Stable integer id 0..51 for a card (rank-major). */
export function cardId(card: Card): number {
  return (card.rank - 2) * 4 + card.suit;
}

export function cardFromId(id: number): Card {
  return { rank: Math.floor(id / 4) + 2, suit: id % 4 };
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit;
}

/** Full 52-card deck. */
export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const rank of RANKS) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Deck with the given cards removed (by identity). */
export function deckWithout(used: Card[]): Card[] {
  const usedIds = new Set(used.map(cardId));
  return fullDeck().filter((c) => !usedIds.has(cardId(c)));
}
