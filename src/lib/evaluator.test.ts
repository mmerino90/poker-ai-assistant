import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { evaluate7, categoryOf, HAND_CATEGORY } from "./evaluator";

const ev = (s: string) => evaluate7(parseCards(s));
const cat = (s: string) => categoryOf(ev(s));

describe("hand category detection", () => {
  it("detects a straight flush", () => {
    expect(cat("9s 8s 7s 6s 5s 2h 2d")).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
  });
  it("detects the wheel straight flush (A-2-3-4-5)", () => {
    expect(cat("As 2s 3s 4s 5s Kh Qd")).toBe(HAND_CATEGORY.STRAIGHT_FLUSH);
  });
  it("detects four of a kind", () => {
    expect(cat("Ks Kh Kd Kc 9s 4h 2d")).toBe(HAND_CATEGORY.QUADS);
  });
  it("detects a full house", () => {
    expect(cat("Ks Kh Kd 9c 9s 4h 2d")).toBe(HAND_CATEGORY.FULL_HOUSE);
  });
  it("treats two trips as a full house", () => {
    expect(cat("Ks Kh Kd Qc Qs Qh 2d")).toBe(HAND_CATEGORY.FULL_HOUSE);
  });
  it("detects a flush", () => {
    expect(cat("As Js 9s 5s 2s Kh Qd")).toBe(HAND_CATEGORY.FLUSH);
  });
  it("detects a straight", () => {
    expect(cat("9s 8h 7d 6c 5s Kh Qd")).toBe(HAND_CATEGORY.STRAIGHT);
  });
  it("detects the wheel straight", () => {
    expect(cat("As 2h 3d 4c 5s Kh Qd")).toBe(HAND_CATEGORY.STRAIGHT);
  });
  it("detects three of a kind", () => {
    expect(cat("7s 7h 7d Kc 9s 4h 2d")).toBe(HAND_CATEGORY.TRIPS);
  });
  it("detects two pair", () => {
    expect(cat("9s 9h 4d 4c Ks 2h 7d")).toBe(HAND_CATEGORY.TWO_PAIR);
  });
  it("detects one pair", () => {
    expect(cat("9s 9h Kd 4c 2s 7h Td")).toBe(HAND_CATEGORY.PAIR);
  });
  it("detects high card", () => {
    expect(cat("As Jh 9d 7c 5s 3h 2d")).toBe(HAND_CATEGORY.HIGH_CARD);
  });
});

describe("hand comparisons", () => {
  it("ranks straight flush above four of a kind", () => {
    expect(ev("9s 8s 7s 6s 5s 2h 2d")).toBeGreaterThan(ev("Ks Kh Kd Kc 9s 4h 2d"));
  });
  it("ranks flush above straight", () => {
    expect(ev("As Js 9s 5s 2s Kh Qd")).toBeGreaterThan(ev("9s 8h 7d 6c 5s Kh Qd"));
  });
  it("higher full house beats lower full house", () => {
    expect(ev("Ks Kh Kd 2c 2s 4h 9d")).toBeGreaterThan(ev("Qs Qh Qd Ac As 4h 9d"));
  });
  it("compares flushes by high cards", () => {
    expect(ev("As Js 9s 5s 2s 3h 3d")).toBeGreaterThan(ev("Ks Js 9s 5s 2s 3h 3d"));
  });
  it("uses kicker to break a pair tie", () => {
    expect(ev("9s 9h As Kd 2c 3h 4d")).toBeGreaterThan(ev("9s 9h Qs Kd 2c 3h 4d"));
  });
  it("the nut flush beats the same straight, picking best 5 of 7", () => {
    // Board makes both a straight and a flush available; flush should win.
    const flushHand = ev("Ah Kh 9h 8h 2h Ts 3d"); // flush in hearts
    const straightHand = ev("9c 8d 7h 6s 5c Ah Kd"); // 9-high straight
    expect(flushHand).toBeGreaterThan(straightHand);
  });
  it("recognises equal best hands as a tie (split pot)", () => {
    // Both players play the board: royal-ish straight on board.
    const a = ev("2c 3d Ah Kh Qh Jh Th");
    const b = ev("4c 5d Ah Kh Qh Jh Th");
    expect(a).toBe(b);
  });
});
