"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { Emoji } from "@/components/ui/Emoji";
import {
  daysInCalendarMonth,
  formatDateStr,
  formatKoreanDateLabel,
  nextCalendarMonth,
  parseDateStr,
  previousCalendarMonth,
} from "@/components/ui/calendarUtils";

interface DatePickerProps {
  id?: string;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  min?: string; // YYYY-MM-DD
  max?: string; // YYYY-MM-DD
  minReason?: string; // min 이전(선택 불가) 날짜 호버 시 안내 툴팁
  maxReason?: string; // max 이후(선택 불가) 날짜 호버 시 안내 툴팁
  placeholder?: string; // 값이 없을 때 버튼에 표시할 안내 문구
  dialogEyebrow?: string; // 달력 모달 상단 작은 제목
}

export function DatePicker({
  id,
  value,
  onChange,
  min,
  max,
  minReason,
  maxReason,
  placeholder = "날짜 선택",
  dialogEyebrow = "회의 마감일",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const sel = value ? parseDateStr(value) : null;
  const [view, setView] = useState(() => {
    const base = value || min || "";
    if (base) {
      const p = parseDateStr(base);
      return { y: p.y, m: p.m };
    }
    return { y: 2026, m: 1 };
  });

  useScrollLock(open);

  useEffect(() => {
    if (!open) {
      setTip(null);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minStr = min ?? "";
  const maxStr = max ?? "";

  const prev = previousCalendarMonth(view);
  const prevLastDay = formatDateStr(prev.y, prev.m, daysInCalendarMonth(prev.y, prev.m));
  const canPrev = !minStr || prevLastDay >= minStr;
  const nextMonth = nextCalendarMonth(view);
  const nextFirstDay = formatDateStr(nextMonth.y, nextMonth.m, 1);
  const canNext = !maxStr || nextFirstDay <= maxStr;

  const label = value ? formatKoreanDateLabel(value) : "날짜 선택";

  function go(delta: number) {
    setView((v) => (delta < 0 ? previousCalendarMonth(v) : nextCalendarMonth(v)));
  }
  function pick(date: string) {
    if (minStr && date < minStr) return;
    if (maxStr && date > maxStr) return;
    onChange(date);
    setOpen(false);
  }

  const calendarDialog = open ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3 py-4 sm:px-4 sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="날짜 선택 달력"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[22rem] overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:max-w-[24rem] sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <div>
            <p className="text-xs font-bold text-brand-600">{dialogEyebrow}</p>
            <p className="mt-0.5 text-sm font-bold text-slate-900">{label}</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="달력 닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <Emoji symbol="✕" size={20} />
          </button>
        </div>

        <CalendarGrid
          month={view}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          emptyCellPrefix="e"
          renderDate={(cell) => {
            const s = cell.date;
            const d = cell.day;
            const tooEarly = Boolean(minStr) && s < minStr;
            const tooLate = Boolean(maxStr) && s > maxStr;
            const disabled = tooEarly || tooLate;
            const reason = tooEarly ? minReason : tooLate ? maxReason : undefined;
            const selected = value === s;
            const dow = cell.weekday;
            return (
              <button
                key={s}
                type="button"
                aria-disabled={disabled || undefined}
                tabIndex={disabled ? -1 : undefined}
                onClick={() => pick(s)}
                onMouseEnter={
                  disabled
                    ? (e) => {
                        if (!reason) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        setTip({ text: reason, x: r.left + r.width / 2, y: r.top });
                      }
                    : undefined
                }
                onMouseLeave={disabled ? () => setTip(null) : undefined}
                aria-label={`${view.y}년 ${view.m}월 ${d}일${selected ? " 선택됨" : ""}`}
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "aspect-square rounded-lg text-sm transition-colors",
                  selected
                    ? "bg-brand-500 font-bold text-white shadow-sm shadow-brand-500/20"
                    : disabled
                      ? "cursor-not-allowed text-slate-300"
                      : cn(
                          "hover:bg-brand-50",
                          dow === 0
                            ? "text-red-500"
                            : dow === 6
                              ? "text-blue-500"
                              : "text-slate-700",
                        ),
                )}
              >
                {d}
              </button>
            );
          }}
        />
      </div>
    </div>
  ) : null;

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          // 열 때 선택된 달로 점프.
          if (!open && sel) setView({ y: sel.y, m: sel.m });
          setOpen((o) => !o);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
      >
        <span className={sel ? "" : "text-slate-400"}>{sel ? label : placeholder}</span>
        <Emoji symbol="📅" size={16} />
      </button>

      {calendarDialog ? createPortal(calendarDialog, document.body) : null}
      {tip
        ? createPortal(
            <div
              role="tooltip"
              style={{ left: tip.x, top: tip.y }}
              className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-full"
            >
              <div className="mb-2 max-w-[12rem] rounded-lg bg-slate-800 px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-white shadow-lg">
                {tip.text}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
