import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { recommend } from "./decision";
import {
  startHand,
  applyAction,
  advanceStreet,
  heroContext,
  isRoundComplete,
  type PlayerSetup,
} from "./handState";

// End-to-end: this mirrors exactly what the UI does when you tap actions and
// then hit "Advise me" — table state machine feeding the decision engine.

describe("full hand: table tracker -> advice", () => {
  it("derives pot/to-call/position from logged actions and advises the hero", () => {
    const players: PlayerSetup[] = [
      { label: "You", stack: 200, isHero: true },
      { label: "P2", stack: 200 },
      { label: "P3", stack: 200 },
    ];

    // Button = You (seat 0); SB = seat 1, BB = seat 2; blinds 1/2.
    let h = startHand(players, { buttonId: 0, sbId: 1, bbId: 2, sb: 1, bb: 2 });

    // Preflop: You (button) raise to 6, SB calls, BB folds.
    h = applyAction(h, { type: "raise", to: 6 });
    h = applyAction(h, { type: "call" });
    h = applyAction(h, { type: "fold" });
    expect(isRoundComplete(h)).toBe(true);

    // Deal the flop.
    h = advanceStreet(h, parseCards("Ah Kd 7c"));
    // SB checks; action is now on the hero.
    h = applyAction(h, { type: "check" });

    const ctx = heroContext(h);
    expect(ctx.isHeroTurn).toBe(true);
    expect(ctx.pot).toBe(14); // 6 + 6 + 2
    expect(ctx.toCall).toBe(0); // checked to you
    expect(ctx.playersInHand).toBe(2);
    expect(ctx.position).toBe("button");
    expect(ctx.stack).toBe(194); // 200 - 6 committed

    // Hero holds a set of aces -> should bet for value.
    const d = recommend({
      hole: parseCards("As Ac"),
      board: parseCards("Ah Kd 7c"),
      playersInHand: ctx.playersInHand,
      position: ctx.position,
      pot: ctx.pot,
      toCall: ctx.toCall,
      stack: ctx.stack,
      iterations: 20000,
    });
    expect(["Bet", "All-in"]).toContain(d.action);
    expect(d.amount).toBeGreaterThan(0);
  });

  it("derives the correct to-call when the hero faces a bet", () => {
    const players: PlayerSetup[] = [
      { label: "You", stack: 200, isHero: true },
      { label: "P2", stack: 200 },
      { label: "P3", stack: 200 },
    ];
    // Button = P3 (seat 2); SB = You (seat 0); BB = P2 (seat 1).
    let h = startHand(players, { buttonId: 2, sbId: 0, bbId: 1, sb: 1, bb: 2 });
    // First to act preflop is left of BB (seat 1) -> seat 2 (the button).
    expect(h.toActId).toBe(2);
    h = applyAction(h, { type: "raise", to: 8 });

    const ctx = heroContext(h);
    expect(ctx.isHeroTurn).toBe(true);
    expect(ctx.position).toBe("blinds");
    expect(ctx.toCall).toBe(7); // raised to 8, hero already has 1 in as SB
    expect(ctx.pot).toBe(11); // 8 (P3) + 1 (SB) + 2 (BB)
  });
});
