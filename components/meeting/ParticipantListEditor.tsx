"use client";

import {
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { SearchField } from "@toss/tds-mobile";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Emoji } from "@/components/ui/Emoji";
import { MOCK_EMPLOYEES } from "@/data/mockEmployees";
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

const MIN_PARTICIPANTS = 2;

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
  // 마퀴(드래그 박스) 선택 영역(구역 래퍼 기준 좌표).
  const [marquee, setMarquee] = useState<{ l: number; t: number; w: number; h: number } | null>(
    null,
  );
  const movingRef = useRef<string[]>([]);
  const zonesRef = useRef<HTMLDivElement>(null);

  const selectedKeys = new Set(participants.map(employeeKey));
  const requiredCount = participants.filter((p) => p.attendanceType === "required").length;
  const optionalCount = participants.length - requiredCount;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = MOCK_EMPLOYEES.filter((employee) => {
    if (!normalizedQuery) return true;
    return `${employee.name} ${employee.role}`.toLowerCase().includes(normalizedQuery);
  });

  function toggleEmployee(employee: Pick<ParticipantDraft, "name" | "role">) {
    const key = employeeKey(employee);
    if (selectedKeys.has(key)) {
      onChange(participants.filter((p) => employeeKey(p) !== key));
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
    <div className="flex h-full flex-col gap-2">
      {/* 검색 (TDS SearchField) */}
      <div className="max-w-sm shrink-0">
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onDeleteClick={() => setQuery("")}
          placeholder="이름 또는 직책 검색"
          aria-label="직원 검색"
        />
      </div>

      {/* 직원 목록 — 클릭으로 추가/해제 토글 (위아래 페이드 + 스크롤) */}
      <div className="relative h-64 shrink-0">
        <div className="h-full space-y-2 overflow-y-auto px-0.5 py-1">
          {filteredEmployees.map((employee) => {
            const selected = selectedKeys.has(employeeKey(employee));
            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => toggleEmployee(employee)}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-brand-200 bg-brand-50"
                    : "border-slate-200 bg-white hover:bg-slate-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {employee.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{employee.role}</span>
                </span>
                {selected ? (
                  <Badge tone="green" className="shrink-0">
                    선택됨 · 해제
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
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            빈 곳을 드래그하면 여러 명을 한 번에 선택해요. 이름을 끌어 구역을 옮기세요.
          </p>
          <Badge tone={participants.length >= MIN_PARTICIPANTS ? "green" : "amber"}>
            필수 {requiredCount}명 · 선택 {optionalCount}명
          </Badge>
        </div>

        <div
          ref={zonesRef}
          onMouseDown={handleZonesMouseDown}
          className="relative min-h-0 flex-1 select-none"
        >
          <div className="grid h-full grid-cols-2 grid-rows-1 gap-3">
            {GROUPS.map((g) => {
              const members = participants.filter((p) => p.attendanceType === g.type);
              return (
                <div
                  key={g.type}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverZone(g.type);
                  }}
                  onDragLeave={() => setOverZone((o) => (o === g.type ? null : o))}
                  onDrop={(e) => handleDrop(e, g.type)}
                  className={cn(
                    "flex flex-col gap-2 overflow-y-auto rounded-xl border p-3 transition-colors",
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
                            title={`${p.name} — 끌어서 구역 이동`}
                            className={cn(
                              "inline-flex cursor-grab select-none items-center gap-1 rounded-full border py-1 pl-3 pr-1 active:cursor-grabbing",
                              picked
                                ? "border-brand-400 bg-brand-50 ring-2 ring-brand-200"
                                : "border-slate-200 bg-white",
                              dragKey === key && "opacity-50",
                            )}
                          >
                            <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
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
    </div>
  );
}
