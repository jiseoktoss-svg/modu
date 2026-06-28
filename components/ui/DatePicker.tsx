"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
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
        className="flex h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        <span className={sel ? "" : "text-slate-400"}>{label}</span>
        <Emoji symbol="📅" size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="날짜 선택 달력"
          className="absolute bottom-full left-0 z-40 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={!canPrev}
              aria-label="이전 달"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-30"
            >
              <Chevron dir="left" />
            </button>
            <span className="text-sm font-bold text-slate-900">
              {view.y}년 {view.m}월
            </span>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="다음 달"
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
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
                      ? "bg-brand-500 font-bold text-white"
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
      )}
    </div>
  );
}
