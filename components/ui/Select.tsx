import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 sm:text-sm",
        "focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
