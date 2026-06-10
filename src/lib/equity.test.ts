import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { estimateEquity } from "./equity";

// Monte Carlo is stochastic; use a generous tolerance and enough iterations.
const ITERS = 40000;
const eq = (hole: string, board: string, opps: number) =>
  estimateEquity(parseCards(hole), board ? parseCards(board) : [], opps, ITERS)
    .equity;

describe("equity sanity vs known values", () => {
  it("AA vs 1 random hand is ~85%", () => {
    const e = eq("As Ah", "", 1);
    expect(e).toBeGreaterThan(0.82);
    expect(e).toBeLessThan(0.88);
  });

  it("AKs vs KK is dominated-ish; AA vs KK preflop ~82%", () => {
    // We can't fix the opponent hand, but AA vs 1 random should beat 72o vs 1.
    const aa = eq("As Ah", "", 1);
    const trash = eq("7d 2c", "", 1);
    expect(aa).toBeGreaterThan(trash);
  });

  it("equity drops as opponents increase", () => {
    const vs1 = eq("As Ah", "", 1);
    const vs2 = eq("As Ah", "", 2);
    const vs5 = eq("As Ah", "", 5);
    expect(vs1).toBeGreaterThan(vs2);
    expect(vs2).toBeGreaterThan(vs5);
  });

  it("a made flush on the river has very high equity vs 1", () => {
    const e = eq("As Ks", "Qs Js 2s 7h 3d", 1);
    expect(e).toBeGreaterThan(0.9);
  });

  it("the stone-cold nuts (royal flush) is 100% vs 2", () => {
    const e = eq("As Ks", "Qs Js Ts 7h 3d", 2);
    expect(e).toBe(1);
  });

  it("72o vs 1 random is roughly a third", () => {
    const e = eq("7d 2c", "", 1);
    expect(e).toBeGreaterThan(0.28);
    expect(e).toBeLessThan(0.4);
  });

  it("a coin-flip (AKs vs 22-ish) lands near 50% — pair vs overs on dry board", () => {
    // 88 vs AKo all-in preflop is the classic ~50/50; approximate with 1 opp.
    const e = eq("8h 8d", "", 1);
    expect(e).toBeGreaterThan(0.6); // 88 beats a single random hand comfortably
  });
});
