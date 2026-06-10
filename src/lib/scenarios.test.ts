import { describe, it, expect } from "vitest";
import { parseCards } from "./cards";
import { recommend, type Position } from "./decision";

// Realistic 3-player home-game spots. These both verify the end-to-end engine
// output the UI shows AND double as readable documentation of its behaviour.

type Spot = {
  name: string;
  hole: string;
  board?: string;
  players?: number;
  position?: Position;
  pot: number;
  toCall: number;
  stack?: number;
  expect: string[]; // acceptable actions
};

const SPOTS: Spot[] = [
  {
    name: "Button AKs preflop, folded to you",
    hole: "As Ks",
    players: 3,
    position: "button",
    pot: 3,
    toCall: 2,
    stack: 200,
    expect: ["Raise", "All-in"],
  },
  {
    name: "Blinds with 72o facing a raise",
    hole: "7d 2c",
    players: 3,
    position: "blinds",
    pot: 10,
    toCall: 8,
    stack: 200,
    expect: ["Fold"],
  },
  {
    name: "Top pair top kicker on the flop, facing a half-pot bet",
    hole: "Ah Kd",
    board: "Ks 7c 2d",
    players: 3,
    position: "middle",
    pot: 20,
    toCall: 10,
    stack: 200,
    expect: ["Raise", "Call", "All-in"],
  },
  {
    name: "Bare flush draw on the flop, facing a small bet (good price)",
    hole: "As 4s",
    board: "Ks 9s 2h",
    players: 2,
    position: "button",
    pot: 30,
    toCall: 5,
    stack: 200,
    expect: ["Call", "Raise"],
  },
  {
    name: "Missed draw on the river, facing a pot-sized bet",
    hole: "Js Ts",
    board: "Ks 7c 2d 5h 3c",
    players: 2,
    position: "blinds",
    pot: 40,
    toCall: 40,
    stack: 200,
    expect: ["Fold"],
  },
  {
    name: "The nuts on the river, checked to you",
    hole: "As Ks",
    board: "Qs Js Ts 4h 3d",
    players: 3,
    position: "button",
    pot: 60,
    toCall: 0,
    stack: 200,
    expect: ["Bet", "All-in"],
  },
];

describe("realistic 3-player scenarios", () => {
  for (const s of SPOTS) {
    it(s.name, () => {
      const d = recommend({
        hole: parseCards(s.hole),
        board: s.board ? parseCards(s.board) : [],
        playersInHand: s.players ?? 3,
        position: s.position ?? "middle",
        pot: s.pot,
        toCall: s.toCall,
        stack: s.stack ?? 200,
        iterations: 25000,
      });
      const sizing = d.amount !== undefined ? ` $${d.amount}` : "";
      console.log(
        `  ${s.name}\n    -> ${d.action}${sizing} | equity ${Math.round(
          d.equity.equity * 100,
        )}% | pot odds ${
          d.potOdds === null ? "n/a" : Math.round(d.potOdds * 100) + "%"
        }`,
      );
      expect(s.expect).toContain(d.action);
    });
  }
});
