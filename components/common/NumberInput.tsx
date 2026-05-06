"use client";

import type { InputHTMLAttributes } from "react";

type NumberInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string;
  error?: string;
};

export function NumberInput({ label, error, className = "", ...props }: NumberInputProps) {
  return (
    <label className="flex w-full flex-col gap-1 text-sm text-labMuted">
      {label && <span>{label}</span>}
      <input
        type="number"
        className={`w-full rounded-xl border border-labBorder bg-[#090909] px-3 py-2 text-labText outline-none focus:border-labAccent ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-labDanger">{error}</span>}
    </label>
  );
}
