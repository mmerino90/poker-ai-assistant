import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { recommend, type Position } from "./decision";

const ITERS = 20000;

function decide(opts: {
  hole: string;
  board?: string;
  players?: number;
  position?: Position;
  pot: number;
  toCall: number;
  stack?: number;
}) {
  return recommend({
    hole: parseCards(opts.hole),
    board: opts.board ? parseCards(opts.board) : [],
    playersInHand: opts.players ?? 2,
    position: opts.position ?? "middle",
    pot: opts.pot,
    toCall: opts.toCall,
    stack: opts.stack ?? 1000,
    iterations: ITERS,
  });
}

describe("decision engine", () => {
  it("raises the nuts when facing a bet", () => {
    const d = decide({ hole: "As Ks", board: "Qs Js Ts", pot: 100, toCall: 20 });
    expect(["Raise", "All-in"]).toContain(d.action);
    expect(d.amount).toBeGreaterThan(20);
  });

  it("folds trash facing a pot-sized bet", () => {
    const d = decide({ hole: "7d 2c", board: "As Kh Qs", pot: 50, toCall: 50 });
    expect(d.action).toBe("Fold");
  });

  it("bets a strong made hand when checked to", () => {
    const d = decide({ hole: "As Ah", board: "Ad 7c 2s", pot: 100, toCall: 0 });
    expect(d.action).toBe("Bet");
    expect(d.amount).toBeGreaterThan(0);
  });

  it("checks a weak hand when it's free", () => {
    const d = decide({ hole: "7d 2c", board: "As Kh Qs 9d 3c", pot: 80, toCall: 0 });
    expect(d.action).toBe("Check");
  });

  it("calls when the price is right but the hand isn't strong enough to raise", () => {
    // Middle pair vs 1 opponent, tiny bet into a big pot: clearly profitable call.
    const d = decide({ hole: "8h 8d", board: "Ah Kd 2c", pot: 90, toCall: 10 });
    expect(d.action).toBe("Call");
    expect(d.potOdds).toBeLessThan(0.2);
  });

  it("shoves all-in when the value raise exceeds the stack", () => {
    const d = decide({
      hole: "As Ks",
      board: "Qs Js Ts",
      pot: 50,
      toCall: 10,
      stack: 30,
    });
    expect(d.action).toBe("All-in");
    expect(d.amount).toBe(30);
  });

  it("makes a call-or-fold (all-in call) when the bet exceeds the stack", () => {
    const d = decide({
      hole: "As Ks",
      board: "Qs Js Ts", // the nuts -> profitable
      pot: 100,
      toCall: 100,
      stack: 50,
    });
    expect(d.action).toBe("Call");
    expect(d.amount).toBe(50);
  });

  it("exposes the key numbers and reasons", () => {
    const d = decide({ hole: "As Ah", board: "", players: 3, pot: 30, toCall: 10 });
    expect(d.equity.equity).toBeGreaterThan(0);
    expect(d.potOdds).toBeCloseTo(10 / 40, 5);
    expect(d.fairShare).toBeCloseTo(1 / 3, 5);
    expect(d.reasons.length).toBeGreaterThan(2);
    expect(d.street).toBe("preflop");
  });
});
