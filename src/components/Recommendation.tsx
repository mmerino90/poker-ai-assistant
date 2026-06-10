import type { Decision } from "@/lib/decision";

const ACTION_STYLE: Record<string, string> = {
  Fold: "bg-red-500/20 text-red-300 ring-red-400/40",
  Check: "bg-slate-500/20 text-slate-200 ring-slate-300/40",
  Call: "bg-sky-500/20 text-sky-200 ring-sky-300/40",
  Bet: "bg-amber-500/20 text-amber-200 ring-amber-300/50",
  Raise: "bg-amber-500/25 text-amber-100 ring-amber-300/60",
  "All-in": "bg-fuchsia-500/25 text-fuchsia-200 ring-fuchsia-300/60",
};

export function Recommendation({
  d,
  players,
}: {
  d: Decision;
  players: number;
}) {
  const style = ACTION_STYLE[d.action] ?? ACTION_STYLE.Check;
  const equityPct = Math.round(d.equity.equity * 100);
  const fairPct = Math.round(d.fairShare * 100);
  return (
    <section className="mb-4 rounded-2xl bg-surface-2/80 p-4 ring-1 ring-white/15">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent">
        Recommended play
      </div>
      <div
        className={`flex items-baseline justify-between rounded-xl px-4 py-3 ring-1 ${style}`}
      >
        <span className="text-3xl font-extrabold tracking-tight">
          {d.action}
        </span>
        {d.amount !== undefined && (
          <span className="text-xl font-bold">
            {d.action === "All-in" || d.action === "Call" ? "" : "to "}$
            {d.amount}
          </span>
        )}
      </div>

      {/* Equity bar */}
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Equity {equityPct}%</span>
          <span>fair share {fairPct}%</span>
        </div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400"
            style={{ width: `${equityPct}%` }}
          />
          <div
            className="absolute top-0 h-full w-0.5 bg-white"
            style={{ left: `${fairPct}%` }}
            title="fair share"
          />
        </div>
      </div>

      {/* Key numbers */}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="Win" value={`${Math.round(d.equity.win * 100)}%`} />
        <Stat
          label="Pot odds"
          value={d.potOdds === null ? "—" : `${Math.round(d.potOdds * 100)}%`}
        />
        <Stat label="Street" value={d.street} />
      </dl>

      {/* Reasoning */}
      <ul className="mt-4 space-y-1.5 text-sm text-muted">
        {d.reasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-accent">•</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[11px] leading-snug text-white/40">
        Heuristic advice based on Monte-Carlo equity vs {players - 1} unknown
        hand{players - 1 === 1 ? "" : "s"} + pot odds. A strong guide, not a
        solved {players}-player strategy.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 py-2">
      <div className="text-base font-bold capitalize">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </div>
    </div>
  );
}
