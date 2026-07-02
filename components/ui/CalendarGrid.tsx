"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  CALENDAR_WEEKDAYS,
  buildCalendarMonthCells,
  type CalendarDateCell,
  type CalendarMonth,
} from "@/components/ui/calendarUtils";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d={dir === "left" ? "M7.5 3 4.5 6l3 3" : "M4.5 3 7.5 6l-3 3"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarGrid({
  month,
  canPrev,
  canNext,
  onPrev,
  onNext,
  emptyCellPrefix,
  renderDate,
}: {
  month: CalendarMonth;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  emptyCellPrefix: string;
  renderDate: (cell: CalendarDateCell) => ReactNode;
}) {
  const cells = buildCalendarMonthCells(month);

  return (
    <>
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          aria-label="이전 달"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <Chevron dir="left" />
        </button>
        <span className="text-sm font-bold text-slate-800">
          {month.y}년 {month.m}월
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="다음 달"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center">
        {CALENDAR_WEEKDAYS.map((weekday, i) => (
          <div
            key={weekday}
            className={cn(
              "py-1 text-xs font-semibold",
              i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400",
            )}
          >
            {weekday}
          </div>
        ))}
        {cells.map((cell, i) =>
          cell.kind === "empty" ? <div key={`${emptyCellPrefix}${i}`} /> : renderDate(cell),
        )}
      </div>
    </>
  );
}
