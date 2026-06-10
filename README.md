# ♠ Poker Assistant

A phone-friendly **live advice** tool for a casual home game of No-Limit Texas
Hold'em. You enter your cards and the situation as a hand unfolds; it tells you
whether to **fold / check / call / bet / raise** (with a sizing) and shows the
key numbers behind the call — your equity, pot odds, and how you compare to your
"fair share" of the pot.

Inspired by [Gongsta/Poker-AI](https://github.com/Gongsta/Poker-AI). That
project is a heads-up (2-player) CFR bot you *play against*; this is an
*advisor* for a real **3-player (2–6 supported)** table. The piece that
transfers cleanly to more than two players is **equity** — so the engine is
built around a Monte-Carlo equity simulator plus pot-odds / position heuristics,
not a heads-up CFR blueprint (whose Nash-equilibrium guarantees don't hold with
3+ players).

## How it works

1. **Equity** (`src/lib/equity.ts`) — Monte-Carlo: deals thousands of random
   showdowns against the live opponent count to estimate your chance of winning.
2. **Hand evaluation** (`src/lib/evaluator.ts`) — a fast 7-card evaluator that
   scores the best 5-card hand as a single comparable integer.
3. **Decision** (`src/lib/decision.ts`) — combines equity, pot odds
   (`call / (pot + call)`), position, and stack depth into a recommendation:
   - **Calling** is driven by pot odds: continue only when equity beats the
     price (plus a buffer for multiway / future streets).
   - **Betting / raising for value** is driven by how far ahead of your fair
     share (`1 / players`) you are.
   - Position nudges the thresholds (looser on the button, tighter in the blinds).

It's an **honest heuristic** — a strong guide, not a solved multiplayer strategy.

## Run it

```bash
npm install
npm run dev      # open http://localhost:3000 (use it on your phone on the same wifi)
```

Everything runs **client-side in the browser** — no server, works offline once
loaded, and your hands never leave your device.

### Other commands

```bash
npm test         # run the engine unit + scenario tests (Vitest)
npm run build    # production build
npm run lint     # eslint
```

## Using it at the table

The app mirrors the real game with a **visual table + action tracker**, so you
never compute pot or to-call yourself — it derives them from the actions you log.

1. **Set up the table once** (remembered between sessions): number of players,
   small/big blinds, each player's stack, and who has the dealer button.
2. **Deal a hand.** Blinds post automatically and the app shows whose turn it is.
3. **Log each player's action** as it happens — Fold / Check / Call / Bet or
   Raise to an amount. The pot, each player's bet, and your to-call update live.
4. When it's **your** turn, tap your 2 cards (and the board on later streets) and
   hit **"Advise me"** for the recommendation.
5. Tap **"Deal flop/turn/river"** to advance streets, and **"Next hand"** to
   rotate the button and carry stacks forward.

The decision engine reads the live table state (`heroContext` in
`src/lib/handState.ts`) for pot, to-call, players still in, your position, and
your stack — no manual math.

## Project layout

```
src/
  lib/
    cards.ts          card model, parsing, deck helpers
    evaluator.ts      7-card hand evaluator
    equity.ts         Monte-Carlo equity estimator
    decision.ts       pot-odds + heuristic decision engine
    handState.ts      table state machine (blinds, actions, pot/to-call/position)
    *.test.ts         unit + integration + scenario tests
  components/
    CardPicker.tsx    card slots + picker modal
    Recommendation.tsx the advice card
    ui.tsx            shared inputs/buttons
  app/
    page.tsx          setup screen + visual table tracker
```
