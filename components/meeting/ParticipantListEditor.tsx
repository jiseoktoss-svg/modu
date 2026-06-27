"use client";

import { useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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

function employeeKey(p: Pick<ParticipantDraft, "name" | "role">) {
  return `${p.name}::${p.role}`;
}

export function ParticipantListEditor({ participants, onChange }: Props) {
  const selectedKeys = new Set(participants.map(employeeKey));
  const requiredCount = participants.filter((p) => p.attendanceType === "required").length;
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredEmployees = MOCK_EMPLOYEES.filter((employee) => {
    if (!normalizedQuery) return true;
    return `${employee.name} ${employee.role}`.toLowerCase().includes(normalizedQuery);
  });

  function add(employee: Pick<ParticipantDraft, "name" | "role">) {
    const key = employeeKey(employee);
    if (selectedKeys.has(key)) return;
    onChange([...participants, { ...employee, attendanceType: "optional" }]);
  }

  function remove(index: number) {
    if (participants.length <= MIN_PARTICIPANTS) return;
    onChange(participants.filter((_, i) => i !== index));
  }

  function updateAttendance(index: number, attendanceType: AttendanceType) {
    onChange(participants.map((p, i) => (i === index ? { ...p, attendanceType } : p)));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <section className="space-y-3">
        <label className="relative block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 또는 직책 검색"
            className="pl-9"
            aria-label="직원 검색"
          />
        </label>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {filteredEmployees.map((employee) => {
            const selected = selectedKeys.has(employeeKey(employee));
            return (
              <button
                key={employee.id}
                type="button"
                onClick={() => add(employee)}
                disabled={selected}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-default disabled:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-900">
                    {employee.name}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {employee.role}
                  </span>
                </span>
                {selected ? (
                  <Badge tone="green" className="shrink-0">
                    <Check size={12} />
                    선택됨
                  </Badge>
                ) : (
                  <Badge tone="brand" className="shrink-0">
                    <Plus size={12} />
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
      </section>

      <section className="space-y-3">
        <div className="flex justify-end">
          <Badge tone={participants.length >= MIN_PARTICIPANTS ? "green" : "amber"}>
            {participants.length}명 선택 · 필수 {requiredCount}명
          </Badge>
        </div>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {participants.map((p, i) => (
            <div
              key={employeeKey(p)}
              className="grid grid-cols-[1fr_6rem_2.5rem] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                <p className="truncate text-xs text-slate-500">{p.role}</p>
              </div>
              <Select
                aria-label={`${p.name} 참석 유형`}
                value={p.attendanceType}
                onChange={(e) =>
                  updateAttendance(i, e.target.value as AttendanceType)
                }
              >
                <option value="required">필수</option>
                <option value="optional">선택</option>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="md"
                aria-label={`${p.name} 삭제`}
                onClick={() => remove(i)}
                disabled={participants.length <= MIN_PARTICIPANTS}
                className="px-0 text-slate-400 hover:text-red-600"
              >
                <Trash2 size={18} />
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
