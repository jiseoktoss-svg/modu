"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useScrollLock } from "@/lib/useScrollLock";
import { CalendarGrid } from "@/components/ui/CalendarGrid";
import { Emoji } from "@/components/ui/Emoji";
import { formatMonthDay, getCalendarMonthsWithDates } from "@/components/ui/calendarUtils";

// 회의 만들기(components/ui/DatePicker.tsx)의 달력 모달과 같은 달력판을 재사용하되,
// (a) 다중 선택, (b) 모바일 전체화면(상/하 테두리 제거·좌우 꽉참·선택 날짜 칩)까지 지원하는
// 응답 폼 전용 공용 달력 모달.

// 칩 삭제 X 아이콘: 칩의 텍스트 색(currentColor)을 따라간다.
function ChipRemoveIcon() {
  return (
    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
      <path d="M2 2 8 8M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// 한 번에 한 달만 보여주고 < > 로 월을 이동하는 달력(유효 날짜가 있는 월 범위 안에서만).
// DatePicker 의 셀 스타일(aspect-square rounded-lg, 선택 시 채움형)을 그대로 쓴다.
function SelectableCalendarGrid({
  dates,
  selected,
  onToggle,
  tone,
  blockedDates,
  fullWidth = false,
}: {
  dates: string[];
  selected: Set<string>;
  onToggle: (ds: string) => void;
  tone: "busy" | "pref";
  blockedDates?: Set<string>;
  fullWidth?: boolean;
}) {
  const validSet = useMemo(() => new Set(dates), [dates]);
  // 유효 날짜가 들어있는 월 목록(정렬). 이 안에서만 이동한다.
  const months = useMemo(() => getCalendarMonthsWithDates(dates), [dates]);

  const [monthIdx, setMonthIdx] = useState(0);
  const safeIdx = months.length === 0 ? 0 : Math.min(monthIdx, months.length - 1);
  const cur = months[safeIdx];

  if (!cur) return null;

  const monthNumber = cur.m;

  // 선택 하이라이트: 시각적 뼈대는 DatePicker 와 동일(채움형), 색만 tone 별로.
  const selFill =
    tone === "busy"
      ? "bg-red-500 font-bold text-white shadow-sm shadow-red-500/20"
      : "bg-brand-500 font-bold text-white shadow-sm shadow-brand-500/20";

  return (
    <div className={cn("w-full", fullWidth ? "max-w-none" : "max-w-[20rem]")}>
      <CalendarGrid
        month={cur}
        canPrev={safeIdx !== 0}
        canNext={safeIdx !== months.length - 1}
        onPrev={() => setMonthIdx(safeIdx - 1)}
        onNext={() => setMonthIdx(safeIdx + 1)}
        emptyCellPrefix="b"
        renderDate={(cell) => {
          const ds = cell.date;
          const d = cell.day;
          const dow = cell.weekday;
          const isWeekend = dow === 0 || dow === 6;
          const blocked = blockedDates?.has(ds) ?? false;
          const inRange = validSet.has(ds) && !isWeekend;
          const enabled = inRange && !blocked;
          const isSel = selected.has(ds);
          return (
            <button
              key={ds}
              type="button"
              disabled={!enabled}
              onClick={() => onToggle(ds)}
              aria-pressed={isSel}
              aria-label={
                blocked
                  ? `${monthNumber}월 ${d}일 — 불가능한 날짜`
                  : `${monthNumber}월 ${d}일${isSel ? " 선택됨" : ""}`
              }
              className={cn(
                "relative flex aspect-square flex-col items-center justify-center rounded-lg text-sm leading-none transition-colors",
                blocked
                  ? "cursor-not-allowed bg-red-50 text-red-400"
                  : !inRange
                    ? "cursor-not-allowed text-slate-300"
                    : isSel
                      ? selFill
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
              <span className={cn(blocked && "line-through")}>{d}</span>
              {blocked && (
                <span className="mt-0.5 text-[8px] font-bold leading-none text-red-500">불가</span>
              )}
            </button>
          );
        }}
      />
    </div>
  );
}

export function CalendarModal({
  open,
  title,
  subtitle,
  confirmLabel = "확인",
  isMobile,
  dates,
  selected,
  onToggle,
  tone,
  blockedDates,
  showSelectedChips = false,
  extra,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  isMobile: boolean;
  dates: string[];
  selected: Set<string>;
  onToggle: (ds: string) => void;
  tone: "busy" | "pref";
  blockedDates?: Set<string>;
  // 다중 선택(불가능한 날짜)에서 모바일 하단에 선택 날짜 칩을 노출할지.
  showSelectedChips?: boolean;
  // 달력 아래에 붙일 부가 영역(특정 날짜+시간 단계의 시간 입력기 등).
  extra?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}) {
  useScrollLock(open);
  // 모바일 전용 닫힘 애니메이션: 닫기를 누르면 바로 언마운트하지 않고 페이드아웃을 재생한 뒤 실제 닫기를 호출.
  const [closing, setClosing] = useState(false);
  const CLOSE_MS = 250;
  const closeWith = (done: () => void) => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!isMobile || reduce) {
      done();
      return;
    }
    if (closing) return;
    setClosing(true);
    window.setTimeout(done, CLOSE_MS);
  };
  const requestClose = () => closeWith(onClose);
  const requestConfirm = () => closeWith(onConfirm);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const chips = [...selected].sort();
  const chipTone = tone === "busy" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700";

  const selectedChips =
    showSelectedChips && chips.length > 0 ? (
      <div className="flex flex-wrap gap-1.5">
        {chips.map((ds) => (
          <span
            key={ds}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold",
              chipTone,
            )}
          >
            {formatMonthDay(ds)}
            <button
              type="button"
              onClick={() => onToggle(ds)}
              aria-label={`${formatMonthDay(ds)} 삭제`}
              className="ml-0.5 opacity-60 hover:opacity-100"
            >
              <ChipRemoveIcon />
            </button>
          </span>
        ))}
      </div>
    ) : null;

  if (isMobile) {
    // 모바일: 전체화면. 상/하단 테두리 제거, 달력 좌우 꽉 채움([7]), 선택 날짜 칩 하단 노출([8]).
    return createPortal(
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 motion-reduce:animate-none",
          closing ? "animate-fade-out" : "animate-fade-in",
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) requestClose();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-white shadow-2xl will-change-transform motion-reduce:animate-none",
            closing ? "animate-fade-out" : "animate-sheet-up",
          )}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-bold text-slate-900">{title}</p>
              {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label={`${title} 닫기`}
              className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <Emoji symbol="✕" size={20} />
            </button>
          </div>
          <div className="flex flex-1 flex-col items-stretch gap-4 overflow-y-auto p-4">
            <SelectableCalendarGrid
              dates={dates}
              selected={selected}
              onToggle={onToggle}
              tone={tone}
              blockedDates={blockedDates}
              fullWidth
            />
            {selectedChips}
            {extra}
          </div>
          <div className="shrink-0 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={requestConfirm}
              className="w-full rounded-xl bg-brand-500 py-3 text-base font-bold text-white transition-colors hover:bg-brand-600"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // 데스크톱: 회의 만들기 DatePicker 와 동일한 톤의 가운데 카드.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-3 py-4 sm:px-4 sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[22rem] overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-2xl sm:max-w-[24rem] sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`${title} 닫기`}
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <Emoji symbol="✕" size={20} />
          </button>
        </div>

        <div className="flex justify-center">
          <SelectableCalendarGrid
            dates={dates}
            selected={selected}
            onToggle={onToggle}
            tone={tone}
            blockedDates={blockedDates}
          />
        </div>
        {extra && <div className="mt-4">{extra}</div>}
        <button
          type="button"
          onClick={onConfirm}
          className="mt-4 w-full rounded-xl bg-brand-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-600"
        >
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
