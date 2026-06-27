"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { AlertCircle, Users, X } from "lucide-react";
import { createMeeting } from "@/app/actions/meetings";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import {
  ParticipantListEditor,
  type ParticipantDraft,
} from "@/components/meeting/ParticipantListEditor";
import { MOCK_EMPLOYEES } from "@/data/mockEmployees";
import type { FormState } from "@/lib/actionTypes";

interface Props {
  defaultDeadlineDate: string;
  minDeadlineDate: string;
}

const INITIAL_PARTICIPANTS: ParticipantDraft[] = MOCK_EMPLOYEES.slice(0, 6).map(
  (employee, index) => ({
    name: employee.name,
    role: employee.role,
    attendanceType: index < 4 ? "required" : "optional",
  }),
);

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending ? "회의 만드는 중…" : "회의 만들고 링크 받기"}
    </Button>
  );
}

export function MeetingCreateForm({ defaultDeadlineDate, minDeadlineDate }: Props) {
  const [state, formAction] = useFormState<FormState, FormData>(createMeeting, {
    error: null,
  });
  const [participants, setParticipants] = useState<ParticipantDraft[]>(
    INITIAL_PARTICIPANTS,
  );
  const [showParticipantModal, setShowParticipantModal] = useState(false);
  const [durationHours, setDurationHours] = useState(1);
  const [durationMinutePart, setDurationMinutePart] = useState(0);
  const filledParticipants = participants.filter((p) => p.name.trim().length > 0);
  const requiredCount = filledParticipants.filter((p) => p.attendanceType === "required").length;

  return (
    <form action={formAction} className="space-y-6">
      <Card className="space-y-5">
        <div>
          <Label htmlFor="title">회의명</Label>
          <Input id="title" name="title" placeholder="예: 주간 제품 회의" required />
        </div>

        <div>
          <Label htmlFor="agenda">안건</Label>
          <Input
            id="agenda"
            name="agenda"
            placeholder="예: 다음 스프린트 범위와 출시 일정 정리"
          />
        </div>

        <div>
          <Label htmlFor="location">장소</Label>
          <Input id="location" name="location" placeholder="예: 7층 회의실 A 또는 Zoom" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="deadlineDate">회의 마감 날짜</Label>
            <Input
              id="deadlineDate"
              name="deadlineDate"
              type="date"
              defaultValue={defaultDeadlineDate}
              min={minDeadlineDate}
              required
            />
          </div>
          <div>
            <Label htmlFor="durationHours">회의 길이</Label>
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div className="relative">
                <Input
                  id="durationHours"
                  name="durationHours"
                  type="number"
                  min={0}
                  step={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="pr-9"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  시간
                </span>
              </div>
              <div className="relative">
                <Input
                  id="durationMinutePart"
                  name="durationMinutePart"
                  type="number"
                  min={0}
                  max={59}
                  step={1}
                  value={durationMinutePart}
                  onChange={(e) => setDurationMinutePart(Number(e.target.value))}
                  className="pr-7"
                  required
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">
                  분
                </span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <button
          type="button"
          onClick={() => setShowParticipantModal(true)}
          className="flex min-h-24 w-full items-center justify-between rounded-2xl border border-brand-100 bg-brand-50 px-5 py-4 text-left transition-colors hover:bg-brand-100"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
              <Users size={21} />
            </span>
            <span>
              <span className="block text-lg font-extrabold text-slate-900">
                참석자 선택
              </span>
              <span className="mt-1 block text-sm font-medium text-slate-600">
                필수 {requiredCount}명 · 선택 {Math.max(filledParticipants.length - requiredCount, 0)}명
              </span>
            </span>
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-brand-600 shadow-sm">
            {filledParticipants.length || 0}명
          </span>
        </button>
        <input
          type="hidden"
          name="participants"
          value={JSON.stringify(
            participants
              .map((p) => ({
                name: p.name.trim(),
                role: p.role.trim(),
                attendanceType: p.attendanceType,
              }))
              .filter((p) => p.name.length > 0),
          )}
        />
      </Card>

      {showParticipantModal && (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-900/40 p-0 sm:items-center sm:p-6">
          <div className="mx-auto max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-slate-900">참석자 선택</h3>
              <button
                type="button"
                onClick={() => setShowParticipantModal(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="참석자 선택 닫기"
              >
                <X size={18} />
              </button>
            </div>
            <ParticipantListEditor participants={participants} onChange={setParticipants} />
            <div className="mt-5 flex justify-end">
              <Button type="button" onClick={() => setShowParticipantModal(false)}>
                선택 완료
              </Button>
            </div>
          </div>
        </div>
      )}

      {state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          <AlertCircle size={16} />
          {state.error}
        </div>
      )}

      <div className="flex justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
