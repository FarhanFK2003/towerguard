import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-amber-500 text-slate-950 shadow-sm hover:bg-amber-400 disabled:hover:bg-amber-500",
  secondary:
    "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50 disabled:hover:bg-white",
  ghost: "text-slate-700 hover:bg-slate-200/60 disabled:hover:bg-transparent",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-500 disabled:hover:bg-red-600",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm [&_svg]:size-4",
  md: "h-10 px-4 text-sm [&_svg]:size-4",
};

/** Button styling, exported so links (e.g. `next/link`) can look like buttons. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
