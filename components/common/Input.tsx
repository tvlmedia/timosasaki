"use client";

import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
};

export function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm text-labMuted">
      {label && <span>{label}</span>}
      <input
        className={`w-full rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-labDanger">{error}</span>}
    </label>
  );
}
