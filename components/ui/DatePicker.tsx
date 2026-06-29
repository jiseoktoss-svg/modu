"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";
import { Emoji } from "@/components/ui/Emoji";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}
function ymd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function parse(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
// tz 드리프트를 피하려 UTC 정수 기준으로 계산한다(lib/time 과 동일 전략).
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function firstWeekday(y: number, m: number) {
  return new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
}

interface DatePickerProps {
  id?: string;
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  min?: string; // YYYY-MM-DD
}

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

export function DatePicker({ id, value, onChange, min }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sel = value ? parse(value) : null;
  const [view, setView] = useState(() => {
    const base = value || min || "";
    if (base) {
      const p = parse(base);
      return { y: p.y, m: p.m };
    }
    return { y: 2026, m: 1 };
  });

  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minStr = min ?? "";
  const dim = daysInMonth(view.y, view.m);
  const lead = firstWeekday(view.y, view.m);
  const cells: Array<number | null> = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);

  const prev = view.m === 1 ? { y: view.y - 1, m: 12 } : { y: view.y, m: view.m - 1 };
  const prevLastDay = ymd(prev.y, prev.m, daysInMonth(prev.y, prev.m));
  const canPrev = !minStr || prevLastDay >= minStr;

  const label = sel
    ? `${sel.y}년 ${sel.m}월 ${sel.d}일 ${WEEKDAYS[new Date(Date.UTC(sel.y, sel.m - 1, sel.d)).getUTCDay()]}요일`
    : "날짜 선택";

  function go(delta: number) {
    setView((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      return { y, m };
    });
  }
  function pick(d: number) {
    const s = ymd(view.y, view.m, d);
    if (minStr && s < minStr) return;
    onChange(s);
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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[22rem] overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-[24rem] sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
          <div>
            <p className="text-xs font-bold text-brand-600">회의 마감일</p>
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

        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={!canPrev}
            aria-label="이전 달"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
          >
            <Chevron dir="left" />
          </button>
          <span className="text-sm font-bold text-slate-800">
            {view.y}년 {view.m}월
          </span>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="다음 달"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100"
          >
            <Chevron dir="right" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "py-1 text-xs font-semibold",
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : "text-slate-400",
              )}
            >
              {w}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={`e${i}`} />;
            const s = ymd(view.y, view.m, d);
            const disabled = Boolean(minStr) && s < minStr;
            const selected = value === s;
            const dow = (lead + (d - 1)) % 7;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => pick(d)}
                aria-label={`${view.y}년 ${view.m}월 ${d}일${selected ? " 선택됨" : ""}`}
                aria-current={selected ? "date" : undefined}
                className={cn(
                  "aspect-square rounded-lg text-sm transition-colors",
                  selected
                    ? "bg-brand-500 font-bold text-white shadow-sm shadow-brand-500/20"
                    : disabled
                      ? "text-slate-300"
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
          })}
        </div>
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
        <span className={sel ? "" : "text-slate-400"}>{label}</span>
        <Emoji symbol="📅" size={16} />
      </button>

      {calendarDialog ? createPortal(calendarDialog, document.body) : null}
    </div>
  );
}
