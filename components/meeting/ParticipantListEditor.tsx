"use client";

import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Emoji } from "@/components/ui/Emoji";
import { MOCK_EMPLOYEES } from "@/data/mockEmployees";
import { MAX_MEETING_PARTICIPANTS } from "@/lib/meetingLimits";
import type { AttendanceType } from "@/lib/types";

export interface ParticipantDraft {
  name: string;
  role: string;
  attendanceType: AttendanceType;
}

interface Props {
  participants: ParticipantDraft[];
  onChange: (next: ParticipantDraft[]) => void;
}

const GROUPS: { type: AttendanceType; title: string }[] = [
  { type: "required", title: "필수참석" },
  { type: "optional", title: "선택참석" },
];

function employeeKey(p: Pick<ParticipantDraft, "name" | "role">) {
  return `${p.name}::${p.role}`;
}

export function ParticipantListEditor({ participants, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<AttendanceType | null>(null);
  const [pickedKeys, setPickedKeys] = useState<Set<string>>(new Set());
  const [touchDrag, setTouchDrag] = useState<{
    keys: string[];
    x: number;
    y: number;
  } | null>(null);
  // 마퀴(드래그 박스) 선택 영역(구역 래퍼 기준 좌표).
  const [marquee, setMarquee] = useState<{ l: number; t: number; w: number; h: number } | null>(
    null,
  );
  const movingRef = useRef<string[]>([]);
  const zonesRef = useRef<HTMLDivElement>(null);
  const touchDragRef = useRef<{
    active: boolean;
    keys: string[];
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const justDraggedRef = useRef(false);

  const selectedKeys = new Set(participants.map(employeeKey));
  const requiredCount = participants.filter((p) => p.attendanceType === "required").length;
  const optionalCount = participants.length - requiredCount;
  const participantLimitReached = participants.length >= MAX_MEETING_PARTICIPANTS;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = MOCK_EMPLOYEES.filter((employee) => {
    if (!normalizedQuery) return true;
    return `${employee.name} ${employee.role}`.toLowerCase().includes(normalizedQuery);
  });

  function toggleEmployee(employee: Pick<ParticipantDraft, "name" | "role">) {
    const key = employeeKey(employee);
    if (selectedKeys.has(key)) {
      onChange(participants.filter((p) => employeeKey(p) !== key));
    } else if (participantLimitReached) {
      return;
    } else {
      onChange([...participants, { ...employee, attendanceType: "required" }]);
    }
  }

  function removeByKey(key: string) {
    onChange(participants.filter((p) => employeeKey(p) !== key));
    setPickedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const n = new Set(prev);
      n.delete(key);
      return n;
    });
  }

  function togglePickedKey(key: string) {
    setPickedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function setTypeMany(keys: string[], type: AttendanceType) {
    const ks = new Set(keys);
    onChange(
      participants.map((p) => (ks.has(employeeKey(p)) ? { ...p, attendanceType: type } : p)),
    );
    setPickedKeys(new Set());
  }

  function handleDragStart(e: DragEvent, key: string) {
    // 선택된 뱃지를 끌면 선택된 모두, 아니면 그 한 명만 이동.
    const moving = pickedKeys.has(key) ? Array.from(pickedKeys) : [key];
    movingRef.current = moving;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify(moving));
    setDragKey(key);
  }

  function handleDrop(e: DragEvent, type: AttendanceType) {
    e.preventDefault();
    let keys = movingRef.current;
    const data = e.dataTransfer.getData("text/plain");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) keys = parsed;
      } catch {
        // 무시
      }
    }
    if (keys.length) setTypeMany(keys, type);
    setDragKey(null);
    setOverZone(null);
    movingRef.current = [];
  }

  function getZoneAtPoint(x: number, y: number): AttendanceType | null {
    const zone = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-drop-zone]");
    const type = zone?.dataset.dropZone;
    if (type === "required" || type === "optional") return type;
    return null;
  }

  function startTouchDrag(e: ReactPointerEvent<HTMLElement>, key: string) {
    if (e.pointerType === "mouse") return;
    if ((e.target as HTMLElement).closest("[data-remove-pill]")) return;

    const keys = pickedKeys.has(key) ? Array.from(pickedKeys) : [key];
    touchDragRef.current = {
      active: false,
      keys,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Playwright 합성 터치 이벤트는 활성 포인터가 없어 capture 가 실패할 수 있다.
      // 실제 브라우저 터치에서는 capture 로 모달 밖 이동까지 추적한다.
    }
  }

  function moveTouchDrag(e: ReactPointerEvent<HTMLElement>) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 8) return;

    drag.active = true;
    justDraggedRef.current = true;
    movingRef.current = drag.keys;
    e.preventDefault();

    const nextZone = getZoneAtPoint(e.clientX, e.clientY);
    setOverZone(nextZone);
    setTouchDrag({ keys: drag.keys, x: e.clientX, y: e.clientY });
  }

  function finishTouchDrag(e: ReactPointerEvent<HTMLElement>) {
    const drag = touchDragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    if (drag.active) {
      const type = getZoneAtPoint(e.clientX, e.clientY);
      if (type) setTypeMany(drag.keys, type);
      window.setTimeout(() => {
        justDraggedRef.current = false;
      }, 300);
    }

    touchDragRef.current = null;
    movingRef.current = [];
    setTouchDrag(null);
    setOverZone(null);
  }

  // 빈 공간을 드래그하면 사각형 안의 뱃지를 한 번에 선택(마퀴).
  function handleZonesMouseDown(e: ReactMouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-pill]")) return; // 뱃지 위 = 이동 드래그이므로 마퀴 시작 안 함
    const cont = zonesRef.current;
    if (!cont) return;
    e.preventDefault();
    const rect = cont.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    setMarquee({ l: startX, t: startY, w: 0, h: 0 });
    setPickedKeys(new Set());

    const onMove = (ev: globalThis.MouseEvent) => {
      const r = cont.getBoundingClientRect();
      const cx = ev.clientX - r.left;
      const cy = ev.clientY - r.top;
      const l = Math.min(startX, cx);
      const t = Math.min(startY, cy);
      const w = Math.abs(cx - startX);
      const h = Math.abs(cy - startY);
      setMarquee({ l, t, w, h });

      const sel = { left: l, top: t, right: l + w, bottom: t + h };
      const next = new Set<string>();
      cont.querySelectorAll<HTMLElement>("[data-pill]").forEach((el) => {
        const pr = el.getBoundingClientRect();
        const p = {
          left: pr.left - r.left,
          top: pr.top - r.top,
          right: pr.right - r.left,
          bottom: pr.bottom - r.top,
        };
        if (
          p.left < sel.right &&
          p.right > sel.left &&
          p.top < sel.bottom &&
          p.bottom > sel.top
        ) {
          const k = el.getAttribute("data-pill");
          if (k) next.add(k);
        }
      });
      setPickedKeys(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setMarquee(null);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex h-full flex-col gap-1.5 sm:gap-2">
      {/* 검색 */}
      <div className="relative max-w-sm shrink-0">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Emoji symbol="🔎" size={15} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 직책 검색"
          aria-label="직원 검색"
          className="h-9 w-full rounded-2xl border border-slate-200 bg-slate-50 py-0 pl-9 pr-10 text-base font-medium text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-2 focus:border-brand-400 focus:bg-white focus:ring-0 sm:h-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="검색어 지우기"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
          >
            <Emoji symbol="✕" size={12} />
          </button>
        )}
      </div>

      {/* 직원 목록 — 클릭으로 추가/해제 토글 (위아래 페이드 + 스크롤) */}
      <div className="relative h-[32dvh] min-h-32 max-h-48 shrink-0 sm:h-64 sm:max-h-none">
        <div className="h-full space-y-1.5 overflow-y-auto px-0.5 py-1 sm:space-y-2">
          {filteredEmployees.map((employee) => {
            const selected = selectedKeys.has(employeeKey(employee));
            const disabledByLimit = !selected && participantLimitReached;
            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => toggleEmployee(employee)}
                aria-pressed={selected}
                disabled={disabledByLimit}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 sm:gap-3 sm:px-3 sm:py-2.5",
                  selected
                    ? "border-brand-200 bg-brand-50"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {employee.name}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 sm:text-xs">{employee.role}</span>
                </span>
                {selected ? (
                  <Badge tone="green" className="shrink-0">
                    선택됨 · 해제
                  </Badge>
                ) : disabledByLimit ? (
                  <Badge tone="gray" className="shrink-0">
                    최대 {MAX_MEETING_PARTICIPANTS}명
                  </Badge>
                ) : (
                  <Badge tone="brand" className="shrink-0">
                    추가
                  </Badge>
                )}
              </button>
            );
          })}
          {filteredEmployees.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
              검색 결과가 없어요.
            </p>
          )}
        </div>
        {/* 위아래 흐림(페이드) */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-white to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-white to-transparent" />
      </div>

      {/* 필수참석 / 선택참석 구역 — 빈 곳 드래그로 범위 선택, 뱃지를 끌어 이동 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="hidden flex-nowrap items-center gap-1.5 sm:flex">
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
              requiredCount > 0 ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500",
            )}
          >
            필수 {requiredCount}명
          </span>
          <span
            className={cn(
              "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold",
              optionalCount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
            )}
          >
            선택 {optionalCount}명
          </span>
        </div>

        <div
          ref={zonesRef}
          onMouseDown={handleZonesMouseDown}
          className="relative min-h-0 flex-1 select-none"
        >
          <div className="grid h-full grid-cols-2 grid-rows-1 gap-2 sm:gap-3">
            {GROUPS.map((g) => {
              const members = participants.filter((p) => p.attendanceType === g.type);
              return (
                <div
                  key={g.type}
                  data-drop-zone={g.type}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverZone(g.type);
                  }}
                  onDragLeave={() => setOverZone((o) => (o === g.type ? null : o))}
                  onDrop={(e) => handleDrop(e, g.type)}
                  className={cn(
                    "flex flex-col gap-1.5 overflow-y-auto rounded-xl border p-2 transition-colors sm:gap-2 sm:p-3",
                    overZone === g.type
                      ? "border-brand-400 bg-brand-50"
                      : "border-slate-200 bg-slate-50",
                  )}
                >
                  <p className="shrink-0 text-xs font-bold text-slate-700">
                    {g.title} <span className="font-normal text-slate-400">{members.length}</span>
                  </p>
                  {members.length === 0 ? (
                    <p className="flex flex-1 items-center justify-center text-center text-xs text-slate-400">
                      여기로 끌어다 놓기
                    </p>
                  ) : (
                    <div className="flex flex-wrap content-start gap-1.5">
                      {members.map((p) => {
                        const key = employeeKey(p);
                        const picked = pickedKeys.has(key);
                        return (
                          <div
                            key={key}
                            data-pill={key}
                            draggable
                            onDragStart={(e) => handleDragStart(e, key)}
                            onDragEnd={() => {
                              setDragKey(null);
                              setOverZone(null);
                            }}
                            onPointerDown={(e) => startTouchDrag(e, key)}
                            onPointerMove={moveTouchDrag}
                            onPointerUp={finishTouchDrag}
                            onPointerCancel={finishTouchDrag}
                            onClick={() => {
                              if (justDraggedRef.current) {
                                justDraggedRef.current = false;
                                return;
                              }
                              togglePickedKey(key);
                            }}
                            title={`${p.name} — 끌어서 구역 이동`}
                            className={cn(
                              "inline-flex touch-none cursor-grab select-none items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 active:cursor-grabbing sm:py-1 sm:pl-3",
                              picked
                                ? "border-brand-400 bg-brand-50 ring-2 ring-brand-200"
                                : "border-slate-200 bg-white",
                              dragKey === key && "opacity-50",
                            )}
                          >
                            <span className="text-xs font-semibold text-slate-900 sm:text-sm">{p.name}</span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              data-remove-pill
                              onClick={(e) => {
                                e.stopPropagation();
                                removeByKey(key);
                              }}
                              aria-label={`${p.name} 삭제`}
                              className="flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
                            >
                              <Emoji symbol="❌" size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {marquee && (
            <div
              className="pointer-events-none absolute z-10 rounded border border-brand-400 bg-brand-400/10"
              style={{ left: marquee.l, top: marquee.t, width: marquee.w, height: marquee.h }}
            />
          )}
        </div>
      </div>

      {touchDrag && (
        <div
          className="pointer-events-none fixed z-[60] rounded-full bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xl"
          style={{ left: touchDrag.x + 10, top: touchDrag.y + 10 }}
        >
          {touchDrag.keys.length}명 이동
        </div>
      )}
    </div>
  );
}
