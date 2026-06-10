import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import {
  startHand,
  applyAction,
  advanceStreet,
  settleHand,
  heroContext,
  isRoundComplete,
  isHandComplete,
  playersInHand,
  seatRoles,
  legalActions,
  showdownCandidates,
  type PlayerSetup,
  type HandConfig,
} from "./handState";

const THREE: PlayerSetup[] = [
  { label: "You", stack: 200, isHero: true },
  { label: "P2", stack: 200 },
  { label: "P3", stack: 200 },
];

// Conventional blinds for a button: SB left of button, BB next.
const cfg = (
  button: number,
  sbId: number,
  bbId: number,
  sb = 1,
  bb = 2,
): HandConfig => ({ buttonId: button, sbId, bbId, sb, bb });

describe("blind posting and seating (3-handed, button = You)", () => {
  const h = startHand(THREE, cfg(0, 1, 2));

  it("posts the blinds and seeds the pot", () => {
    expect(h.players[1].committedHand).toBe(1); // SB
    expect(h.players[2].committedHand).toBe(2); // BB
    expect(h.currentBet).toBe(2);
    expect(heroContext(h).pot).toBe(3);
  });

  it("assigns role tags", () => {
    expect(seatRoles(h, 0)).toEqual(["D"]);
    expect(seatRoles(h, 1)).toEqual(["SB"]);
    expect(seatRoles(h, 2)).toEqual(["BB"]);
  });

  it("button acts first preflop (left of BB) and is in position", () => {
    expect(h.toActId).toBe(0);
    const ctx = heroContext(h);
    expect(ctx.isHeroTurn).toBe(true);
    expect(ctx.position).toBe("button");
    expect(ctx.toCall).toBe(2);
  });
});

describe("custom blind assignment", () => {
  it("lets any seats be SB/BB independent of the button", () => {
    // Dealer = P2 (1), SB = You (0), BB = P3 (2).
    const h = startHand(THREE, cfg(1, 0, 2));
    expect(seatRoles(h, 1)).toEqual(["D"]);
    expect(seatRoles(h, 0)).toEqual(["SB"]);
    expect(seatRoles(h, 2)).toEqual(["BB"]);
    expect(h.players[0].committedHand).toBe(1); // SB posted by hero
    expect(h.players[2].committedHand).toBe(2); // BB posted
    // First to act preflop is left of BB (seat 2) -> seat 0.
    expect(h.toActId).toBe(0);
    // Hero is the small blind here.
    expect(heroContext(h).position).toBe("blinds");
  });
});

describe("a full preflop sequence", () => {
  it("tracks pot, to-call and turn order through raise/call/fold", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "raise", to: 6 });
    expect(h.currentBet).toBe(6);
    expect(h.players[0].stack).toBe(194);
    expect(h.toActId).toBe(1);

    h = applyAction(h, { type: "call" });
    expect(h.players[1].committedRound).toBe(6);
    expect(h.toActId).toBe(2);

    h = applyAction(h, { type: "fold" });
    expect(isRoundComplete(h)).toBe(true);
    expect(playersInHand(h)).toBe(2);
    expect(heroContext(h).pot).toBe(14);
  });
});

describe("street advancement", () => {
  it("resets bets and sets first-to-act left of the button", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "call" });
    h = applyAction(h, { type: "call" });
    h = applyAction(h, { type: "check" });
    expect(isRoundComplete(h)).toBe(true);

    h = advanceStreet(h, parseCards("Ks 7c 2d"));
    expect(h.street).toBe("flop");
    expect(h.currentBet).toBe(0);
    expect(h.board.length).toBe(3);
    expect(h.toActId).toBe(1);
    expect(heroContext(h).toCall).toBe(0);
  });
});

describe("pot payout", () => {
  it("awards the whole pot to the lone survivor", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "raise", to: 6 }); // You raise
    h = applyAction(h, { type: "fold" }); // SB folds
    h = applyAction(h, { type: "fold" }); // BB folds
    expect(isHandComplete(h)).toBe(true);

    const survivors = showdownCandidates(h);
    expect(survivors).toHaveLength(1);
    expect(survivors[0].id).toBe(0);

    const before = h.players[0].stack; // 194 after committing 6
    h = settleHand(h, [survivors[0].id]);
    expect(h.settled).toBe(true);
    expect(h.potWon).toBe(9); // 6 + 1 + 2
    expect(h.players[0].stack).toBe(before + 9);
    expect(heroContext(h).pot).toBe(0); // pot has left the middle
  });

  it("splits the pot evenly between two winners", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "call" }); // You call
    h = applyAction(h, { type: "call" }); // SB completes
    h = applyAction(h, { type: "check" }); // BB checks -> 6 in pot
    h = settleHand(h, [0, 1]);
    expect(h.potWon).toBe(6);
    expect(h.players[0].stack).toBe(201); // 200 - 2 committed + 3 share
    expect(h.players[1].stack).toBe(201);
    expect(h.players[2].stack).toBe(198); // BB committed 2, won nothing
  });
});

describe("all-in handling", () => {
  it("caps a call at the stack and marks all-in", () => {
    const shorty: PlayerSetup[] = [
      { label: "You", stack: 200, isHero: true },
      { label: "P2", stack: 8 },
      { label: "P3", stack: 200 },
    ];
    let h = startHand(shorty, cfg(0, 1, 2));
    h = applyAction(h, { type: "raise", to: 50 });
    h = applyAction(h, { type: "call" });
    expect(h.players[1].status).toBe("allin");
    expect(h.players[1].stack).toBe(0);
    expect(h.players[1].committedHand).toBe(8);
  });
});

describe("legal actions", () => {
  it("offers check (not call) when there is no bet to face", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "call" });
    h = applyAction(h, { type: "call" });
    const la = legalActions(h)!;
    expect(la.canCheck).toBe(true);
    expect(la.callAmount).toBe(0);
  });

  it("offers call with the right amount when facing a bet", () => {
    let h = startHand(THREE, cfg(0, 1, 2));
    h = applyAction(h, { type: "raise", to: 6 });
    const la = legalActions(h)!;
    expect(la.canCall).toBe(true);
    expect(la.callAmount).toBe(5);
    expect(la.canRaise).toBe(true);
  });
});

describe("heads-up blinds", () => {
  it("makes the button the small blind and first to act preflop", () => {
    const hu: PlayerSetup[] = [
      { label: "You", stack: 100, isHero: true },
      { label: "P2", stack: 100 },
    ];
    const h = startHand(hu, cfg(0, 0, 1)); // button is also SB
    expect(seatRoles(h, 0)).toEqual(["D", "SB"]);
    expect(seatRoles(h, 1)).toEqual(["BB"]);
    expect(h.players[0].committedHand).toBe(1);
    expect(h.players[1].committedHand).toBe(2);
    expect(h.toActId).toBe(0); // left of BB(1) = seat 0
    expect(heroContext(h).position).toBe("button");
  });
});
