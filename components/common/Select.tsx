"use client";

import type { SelectHTMLAttributes } from "react";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
};

export function Select({ label, error, className = "", children, ...props }: SelectProps) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm text-labMuted">
      {label && <span>{label}</span>}
      <select
        className={`w-full rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-labDanger">{error}</span>}
    </label>
  );
}
