import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

// 기본 OS 화살표 대신 디자인 시스템 톤(DatePicker 셰브론과 동일)을 쓴다.
function ChevronDown() {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M3 4.5 6 7.5l3-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-3 pr-10 text-base text-slate-900 sm:text-sm",
          "focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
        <ChevronDown />
      </span>
    </div>
  );
}
