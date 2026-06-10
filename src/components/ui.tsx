"use client";

import type { ReactNode } from "react";

export function Label({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  className = "",
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg py-2 text-center text-sm font-semibold transition active:scale-95 ${
        active
          ? "bg-accent text-slate-900 shadow"
          : "bg-white/10 text-foreground hover:bg-white/15"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function MoneyField({
  label,
  value,
  onChange,
  placeholder = "0",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="flex items-center rounded-lg bg-white/10 px-2 ring-1 ring-white/10 focus-within:ring-accent/60">
        <span className="text-muted">$</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent py-2 pl-1 text-base font-semibold outline-none"
        />
      </div>
    </label>
  );
}
