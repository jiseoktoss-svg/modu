import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type BadgeTone = "gray" | "green" | "red" | "amber" | "blue" | "brand";

const TONES: Record<BadgeTone, string> = {
  gray: "bg-slate-100 text-slate-700 border-slate-200",
  green: "bg-green-50 text-green-700 border-green-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "gray", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}
