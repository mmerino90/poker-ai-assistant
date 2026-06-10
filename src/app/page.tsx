"use client";

import { useEffect, useMemo, useState } from "react";
import { type Card, cardId } from "@/lib/cards";
import { recommend, type Decision } from "@/lib/decision";
import {
  type HandState,
  type Street,
  type Action,
  type PlayerSetup,
  startHand,
  applyAction,
  advanceStreet,
  settleHand,
  showdownCandidates,
  heroContext,
  legalActions,
  isRoundComplete,
  isHandComplete,
} from "@/lib/handState";
import { CardPickerModal, type SlotTarget } from "@/components/CardPicker";
import { PokerTable } from "@/components/PokerTable";
import { Recommendation } from "@/components/Recommendation";
import { Label, Chip } from "@/components/ui";

type Setup = {
  numPlayers: number;
  sb: string;
  bb: string;
  stacks: string[]; // index 0 = "You"
};

type Role = "D" | "SB" | "BB";

const STORAGE_KEY = "poker-assistant-setup-v2";

const STREET_DEALT: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
const STREET_NEXT: Record<Street, number> = { preflop: 3, flop: 4, turn: 5, river: 5 };
const NEXT_STREET_NAME: Record<Street, string> = {
  preflop: "flop",
  flop: "turn",
  turn: "river",
  river: "showdown",
};

function defaultSetup(): Setup {
  return { numPlayers: 3, sb: "1", bb: "2", stacks: ["200", "200", "200"] };
}

function labelFor(i: number): string {
  return i === 0 ? "You" : `P${i + 1}`;
}

/** Conventional blind seats for a given button and table size. */
function conventionalBlinds(n: number, button: number): { sbId: number; bbId: number } {
  if (n === 2) return { sbId: button, bbId: (button + 1) % n };
  return { sbId: (button + 1) % n, bbId: (button + 2) % n };
}

export default function Home() {
  const [setup, setSetup] = useState<Setup>(defaultSetup);
  const [buttonId, setButtonId] = useState(0);
  const [sbId, setSbId] = useState(1);
  const [bbId, setBbId] = useState(2);
  const [hand, setHand] = useState<HandState | null>(null);

  const [hole, setHole] = useState<(Card | null)[]>([null, null]);
  const [board, setBoard] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [target, setTarget] = useState<SlotTarget>(null);
  const [betAmount, setBetAmount] = useState("");
  const [betKey, setBetKey] = useState<string | null>(null);
  const [winnerSel, setWinnerSel] = useState<number[]>([]);
  const [result, setResult] = useState<Decision | null>(null);
  const [computing, setComputing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Load persisted table setup once on mount. This intentionally syncs React
  // state from an external system (localStorage) after hydration — the standard
  // way to avoid an SSR/client hydration mismatch for persisted UI state.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        /* eslint-disable react-hooks/set-state-in-effect */
        if (p?.setup) setSetup(p.setup);
        if (typeof p?.buttonId === "number") setButtonId(p.buttonId);
        if (typeof p?.sbId === "number") setSbId(p.sbId);
        if (typeof p?.bbId === "number") setBbId(p.bbId);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ setup, buttonId, sbId, bbId }),
      );
    } catch {
      /* ignore */
    }
  }, [setup, buttonId, sbId, bbId, hydrated]);

  // Reset the bet-size field whenever the player-to-act changes (render-time
  // adjustment — React's documented pattern, avoids an effect cascade).
  if (hand && hand.toActId !== null) {
    const key = `${hand.street}-${hand.toActId}`;
    if (key !== betKey) {
      const la = legalActions(hand);
      setBetKey(key);
      setBetAmount(la ? String(la.minBetTo) : "");
    }
  }

  const usedIds = useMemo(() => {
    const s = new Set<number>();
    for (const c of [...hole, ...board]) if (c) s.add(cardId(c));
    return s;
  }, [hole, board]);

  // ---- Setup helpers -------------------------------------------------------
  function setNumPlayers(n: number) {
    setSetup((s) => {
      const stacks = [...s.stacks];
      while (stacks.length < n) stacks.push("200");
      stacks.length = n;
      return { ...s, numPlayers: n, stacks };
    });
    const b = 0;
    const { sbId: nsb, bbId: nbb } = conventionalBlinds(n, b);
    setButtonId(b);
    setSbId(nsb);
    setBbId(nbb);
  }

  function setStack(i: number, v: string) {
    setSetup((s) => {
      const stacks = [...s.stacks];
      stacks[i] = v;
      return { ...s, stacks };
    });
  }

  function setRole(role: Role, i: number) {
    if (role === "D") setButtonId(i);
    else if (role === "SB") setSbId(i);
    else setBbId(i);
  }

  function autoBlinds() {
    const { sbId: nsb, bbId: nbb } = conventionalBlinds(setup.numPlayers, buttonId);
    setSbId(nsb);
    setBbId(nbb);
  }

  const setupReady =
    Number(setup.sb) > 0 &&
    Number(setup.bb) >= Number(setup.sb) &&
    sbId !== bbId &&
    [buttonId, sbId, bbId].every((id) => id < setup.numPlayers) &&
    setup.stacks
      .slice(0, setup.numPlayers)
      .every((v) => Number(v) > 0 && Number.isFinite(Number(v)));

  function makeSetups(stacks: number[]): PlayerSetup[] {
    return stacks.map((stack, i) => ({ label: labelFor(i), stack, isHero: i === 0 }));
  }

  function resetHandCards() {
    setHole([null, null]);
    setBoard([null, null, null, null, null]);
    setResult(null);
    setWinnerSel([]);
  }

  function beginHand() {
    const stacks = setup.stacks.slice(0, setup.numPlayers).map(Number);
    setHand(
      startHand(makeSetups(stacks), {
        buttonId,
        sbId,
        bbId,
        sb: Number(setup.sb),
        bb: Number(setup.bb),
      }),
    );
    resetHandCards();
  }

  function nextHand() {
    if (!hand) return;
    const n = setup.numPlayers;
    const stacks = hand.players.map((p) => p.stack);
    // Carry stacks back to setup so they persist / show on the setup screen.
    setSetup((s) => ({ ...s, stacks: stacks.map(String) }));
    const nb = (buttonId + 1) % n;
    const nsb = (sbId + 1) % n;
    const nbb = (bbId + 1) % n;
    setButtonId(nb);
    setSbId(nsb);
    setBbId(nbb);
    setHand(
      startHand(makeSetups(stacks), {
        buttonId: nb,
        sbId: nsb,
        bbId: nbb,
        sb: Number(setup.sb),
        bb: Number(setup.bb),
      }),
    );
    resetHandCards();
  }

  // ---- Card pickers --------------------------------------------------------
  function pickCard(card: Card) {
    if (!target) return;
    const setter = target.kind === "hole" ? setHole : setBoard;
    setter((prev) => {
      const next = [...prev];
      next[target.index] = card;
      return next;
    });
    setTarget(null);
    setResult(null);
  }

  function clearTargetCard() {
    if (!target) return;
    const setter = target.kind === "hole" ? setHole : setBoard;
    setter((prev) => {
      const next = [...prev];
      next[target.index] = null;
      return next;
    });
    setTarget(null);
    setResult(null);
  }

  function targetHasCard(): boolean {
    if (!target) return false;
    return (target.kind === "hole" ? hole[target.index] : board[target.index]) !== null;
  }

  // ---- Actions -------------------------------------------------------------
  function act(action: Action) {
    if (!hand) return;
    try {
      setHand(applyAction(hand, action));
      setResult(null);
    } catch (e) {
      console.error(e);
    }
  }

  function dealNextStreet() {
    if (!hand) return;
    const need = STREET_NEXT[hand.street];
    const cards = board.filter((c): c is Card => c !== null).slice(0, need);
    if (cards.length !== need) return;
    try {
      setHand(advanceStreet(hand, cards));
      setResult(null);
    } catch (e) {
      console.error(e);
    }
  }

  function award(ids: number[]) {
    if (!hand || ids.length === 0) return;
    setHand(settleHand(hand, ids));
  }

  function advise() {
    if (!hand) return;
    const holeCards = hole.filter((c): c is Card => c !== null);
    if (holeCards.length !== 2) return;
    const dealt = STREET_DEALT[hand.street];
    const boardCards = board.filter((c): c is Card => c !== null).slice(0, dealt);
    if (boardCards.length !== dealt) return;
    const ctx = heroContext(hand);
    setComputing(true);
    setResult(null);
    setTimeout(() => {
      try {
        setResult(
          recommend({
            hole: holeCards,
            board: boardCards,
            playersInHand: ctx.playersInHand,
            position: ctx.position,
            pot: ctx.pot,
            toCall: ctx.toCall,
            stack: ctx.stack,
          }),
        );
      } finally {
        setComputing(false);
      }
    }, 20);
  }

  // ------------------------------------------------------------------------
  if (!hand) {
    return (
      <SetupScreen
        setup={setup}
        setupReady={setupReady}
        buttonId={buttonId}
        sbId={sbId}
        bbId={bbId}
        onNumPlayers={setNumPlayers}
        onSb={(v) => setSetup((s) => ({ ...s, sb: v }))}
        onBb={(v) => setSetup((s) => ({ ...s, bb: v }))}
        onStack={setStack}
        onRole={setRole}
        onAutoBlinds={autoBlinds}
        onStart={beginHand}
      />
    );
  }

  // ---- In-hand view --------------------------------------------------------
  const ctx = heroContext(hand);
  const roundDone = isRoundComplete(hand);
  const handDone = isHandComplete(hand);
  const dealtCount = STREET_DEALT[hand.street];
  const nextCount = roundDone && !handDone ? STREET_NEXT[hand.street] : dealtCount;
  const boardFilled = board.filter(Boolean).length;
  const holeReady = hole.every(Boolean);
  const candidates = showdownCandidates(hand);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-3 pb-6 pt-3">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold tracking-tight">♠ Poker Assistant</h1>
          <p className="text-xs capitalize text-muted">
            {hand.street} · blinds ${setup.sb}/${setup.bb}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHand(null)}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
        >
          Edit table
        </button>
      </header>

      <PokerTable
        hand={hand}
        hole={hole}
        board={board}
        interactiveBoardCount={nextCount}
        pot={ctx.pot}
        onPickHole={(i) => setTarget({ kind: "hole", index: i })}
        onPickBoard={(i) => setTarget({ kind: "board", index: i })}
      />

      {result && <Recommendation d={result} players={ctx.playersInHand} />}

      <section className="mt-2 rounded-2xl bg-surface-2/80 p-4 ring-1 ring-white/15">
        {hand.settled ? (
          <SettledPanel hand={hand} onNext={nextHand} />
        ) : handDone ? (
          <WinnerPanel
            candidates={candidates}
            pot={ctx.pot}
            winnerSel={winnerSel}
            setWinnerSel={setWinnerSel}
            onAward={award}
          />
        ) : roundDone ? (
          <div className="text-center">
            <div className="font-semibold">
              Round complete — deal the {NEXT_STREET_NAME[hand.street]}
            </div>
            <p className="mt-1 text-sm text-muted">
              Tap the center cards to add the{" "}
              {nextCount === 3 ? "3 flop cards" : "next card"} ({boardFilled}/
              {nextCount}).
            </p>
            <button
              type="button"
              onClick={dealNextStreet}
              disabled={boardFilled !== nextCount}
              className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 disabled:opacity-40 active:scale-[0.99]"
            >
              Deal {NEXT_STREET_NAME[hand.street]} →
            </button>
          </div>
        ) : (
          <ActionPanel
            hand={hand}
            ctx={ctx}
            holeReady={holeReady}
            computing={computing}
            betAmount={betAmount}
            setBetAmount={setBetAmount}
            onAct={act}
            onAdvise={advise}
          />
        )}
      </section>

      {target && (
        <CardPickerModal
          used={usedIds}
          canClear={targetHasCard()}
          onPick={pickCard}
          onClear={clearTargetCard}
          onClose={() => setTarget(null)}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function ActionPanel({
  hand,
  ctx,
  holeReady,
  computing,
  betAmount,
  setBetAmount,
  onAct,
  onAdvise,
}: {
  hand: HandState;
  ctx: ReturnType<typeof heroContext>;
  holeReady: boolean;
  computing: boolean;
  betAmount: string;
  setBetAmount: (v: string) => void;
  onAct: (a: Action) => void;
  onAdvise: () => void;
}) {
  const la = legalActions(hand)!;
  const actor = hand.players[hand.toActId!];
  const isHero = actor.isHero;
  const betVal = Math.min(Math.max(Number(betAmount) || 0, la.minBetTo), la.maxBetTo);
  const betType: "bet" | "raise" = hand.currentBet > 0 ? "raise" : "bet";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="font-semibold">
          {isHero ? "Your turn" : `${actor.label} to act`}
        </span>
        {la.callAmount > 0 && (
          <span className="text-sm text-muted">to call ${la.callAmount}</span>
        )}
      </div>

      {isHero && (
        <button
          type="button"
          onClick={onAdvise}
          disabled={!holeReady || computing}
          className="mb-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 disabled:opacity-40 active:scale-[0.99]"
        >
          {computing ? "Calculating…" : "💡 Advise me"}
        </button>
      )}
      {isHero && !holeReady && (
        <p className="mb-3 -mt-1 text-center text-xs text-muted">
          Tap your 2 cards on the table to get advice.
        </p>
      )}

      <div className="text-xs uppercase tracking-wide text-muted">
        {isHero ? "Log your action" : `Log ${actor.label}'s action`}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Chip onClick={() => onAct({ type: "fold" })} className="bg-red-500/20">
          Fold
        </Chip>
        {la.canCheck ? (
          <Chip onClick={() => onAct({ type: "check" })}>Check</Chip>
        ) : (
          <Chip onClick={() => onAct({ type: "call" })}>Call ${la.callAmount}</Chip>
        )}
      </div>

      {(la.canBet || la.canRaise) && (
        <div className="mt-2 flex items-stretch gap-2">
          <div className="flex flex-1 items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/10 focus-within:ring-accent/60">
            <span className="text-muted">$</span>
            <input
              type="number"
              inputMode="numeric"
              value={betAmount}
              min={la.minBetTo}
              max={la.maxBetTo}
              onChange={(e) => setBetAmount(e.target.value)}
              className="w-full bg-transparent py-2 pl-1 text-base font-semibold outline-none"
            />
          </div>
          <Chip
            onClick={() => onAct({ type: betType, to: betVal })}
            className="flex-1 bg-amber-400/25"
          >
            {betType === "bet" ? "Bet to" : "Raise to"} ${betVal}
          </Chip>
        </div>
      )}
      {(la.canBet || la.canRaise) && la.maxBetTo > betVal && (
        <button
          type="button"
          onClick={() => onAct({ type: betType, to: la.maxBetTo })}
          className="mt-2 w-full rounded-lg bg-fuchsia-500/20 py-2 text-sm font-semibold text-fuchsia-200 hover:bg-fuchsia-500/30"
        >
          All-in ${la.maxBetTo}
        </button>
      )}

      <p className="mt-3 text-[11px] text-white/40">
        You&apos;re{" "}
        {ctx.position === "button"
          ? "on the button"
          : ctx.position === "blinds"
            ? "in the blinds"
            : "in middle position"}
        . Log each player&apos;s action; the pot and amount to call update
        automatically.
      </p>
    </div>
  );
}

function WinnerPanel({
  candidates,
  pot,
  winnerSel,
  setWinnerSel,
  onAward,
}: {
  candidates: HandState["players"];
  pot: number;
  winnerSel: number[];
  setWinnerSel: (ids: number[]) => void;
  onAward: (ids: number[]) => void;
}) {
  // If only one player is left, the winner is unambiguous.
  if (candidates.length === 1) {
    const w = candidates[0];
    return (
      <div className="text-center">
        <div className="text-lg font-bold">Hand over</div>
        <p className="mt-1 text-sm text-muted">
          Everyone else folded — {w.label} win{w.isHero ? "" : "s"} the ${pot}{" "}
          pot.
        </p>
        <button
          type="button"
          onClick={() => onAward([w.id])}
          className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 active:scale-[0.99]"
        >
          Award ${pot} to {w.label}
        </button>
      </div>
    );
  }

  function toggle(id: number) {
    setWinnerSel(
      winnerSel.includes(id)
        ? winnerSel.filter((x) => x !== id)
        : [...winnerSel, id],
    );
  }

  return (
    <div>
      <div className="text-center font-semibold">
        Showdown — who won the ${pot} pot?
      </div>
      <p className="mb-3 mt-1 text-center text-xs text-muted">
        Tap the winner (or tap several to split).
      </p>
      <div className="grid grid-cols-2 gap-2">
        {candidates.map((p) => (
          <Chip key={p.id} active={winnerSel.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.label}
          </Chip>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onAward(winnerSel)}
        disabled={winnerSel.length === 0}
        className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 disabled:opacity-40 active:scale-[0.99]"
      >
        Award pot{winnerSel.length > 1 ? " (split)" : ""}
      </button>
    </div>
  );
}

function SettledPanel({
  hand,
  onNext,
}: {
  hand: HandState;
  onNext: () => void;
}) {
  const names = hand.winners.map((id) => hand.players[id].label).join(" & ");
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-accent">
        {names} won ${hand.potWon}
      </div>
      <p className="mt-1 text-sm text-muted">Stacks updated on the table.</p>
      <button
        type="button"
        onClick={onNext}
        className="mt-3 w-full rounded-xl bg-accent py-3 text-base font-bold text-slate-900 active:scale-[0.99]"
      >
        Next hand →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SetupScreen({
  setup,
  setupReady,
  buttonId,
  sbId,
  bbId,
  onNumPlayers,
  onSb,
  onBb,
  onStack,
  onRole,
  onAutoBlinds,
  onStart,
}: {
  setup: Setup;
  setupReady: boolean;
  buttonId: number;
  sbId: number;
  bbId: number;
  onNumPlayers: (n: number) => void;
  onSb: (v: string) => void;
  onBb: (v: string) => void;
  onStack: (i: number, v: string) => void;
  onRole: (role: Role, i: number) => void;
  onAutoBlinds: () => void;
  onStart: () => void;
}) {
  const roleActive = (role: Role, i: number) =>
    (role === "D" && buttonId === i) ||
    (role === "SB" && sbId === i) ||
    (role === "BB" && bbId === i);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 pb-8 pt-6">
      <header className="mb-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">♠ Poker Assistant</h1>
        <p className="mt-1 text-sm text-muted">Set up your table</p>
      </header>

      <section className="mb-4 rounded-2xl bg-surface/70 p-4 ring-1 ring-white/10">
        <Label>Players at the table</Label>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[2, 3, 4, 5, 6].map((n) => (
            <Chip key={n} active={setup.numPlayers === n} onClick={() => onNumPlayers(n)}>
              {n}
            </Chip>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MoneyField label="Small blind" value={setup.sb} onChange={onSb} />
          <MoneyField label="Big blind" value={setup.bb} onChange={onBb} />
        </div>
      </section>

      <section className="mb-4 rounded-2xl bg-surface/70 p-4 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <Label>Players · roles · stacks</Label>
          <button
            type="button"
            onClick={onAutoBlinds}
            className="text-xs text-accent underline-offset-2 hover:underline"
          >
            Auto blinds from dealer
          </button>
        </div>
        <p className="mb-2 mt-1 text-xs text-muted">
          Assign the dealer (D), small blind (SB), and big blind (BB) to any
          players.
        </p>
        <div className="space-y-2">
          {Array.from({ length: setup.numPlayers }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-9 shrink-0 text-sm font-semibold">
                {labelFor(i)}
              </span>
              <div className="flex shrink-0 gap-1">
                {(["D", "SB", "BB"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onRole(r, i)}
                    className={`h-8 w-9 rounded-md text-[11px] font-bold transition ${
                      roleActive(r, i)
                        ? r === "D"
                          ? "bg-white text-slate-900"
                          : r === "SB"
                            ? "bg-sky-400 text-slate-900"
                            : "bg-amber-400 text-slate-900"
                        : "bg-white/10 text-muted hover:bg-white/15"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/10 focus-within:ring-accent/60">
                <span className="text-muted">$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={setup.stacks[i] ?? ""}
                  min={0}
                  onChange={(e) => onStack(i, e.target.value)}
                  className="w-full bg-transparent py-2 pl-1 text-base font-semibold outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onStart}
        disabled={!setupReady}
        className="w-full rounded-xl bg-accent py-3.5 text-base font-bold text-slate-900 shadow-lg disabled:opacity-40 active:scale-[0.99]"
      >
        Deal hand →
      </button>
      {!setupReady && (
        <p className="mt-2 text-center text-xs text-muted">
          Set blinds (big ≥ small), give SB & BB to different players, and a
          stack for everyone.
        </p>
      )}
    </main>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      <div className="flex items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/10 focus-within:ring-accent/60">
        <span className="text-muted">$</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          className="w-full bg-transparent py-2 pl-1 text-base font-semibold outline-none"
        />
      </div>
    </label>
  );
}
