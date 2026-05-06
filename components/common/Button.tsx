"use client";

import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-labAccent text-black hover:brightness-110",
  secondary: "bg-labPanelAlt border border-labBorder text-labText hover:bg-[#1b1b1b]",
  danger: "bg-labDanger/90 text-white hover:bg-labDanger",
  ghost: "bg-transparent border border-labBorder text-labMuted hover:text-labText hover:border-[#3b3b3b]"
};

export function Button({ variant = "secondary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
