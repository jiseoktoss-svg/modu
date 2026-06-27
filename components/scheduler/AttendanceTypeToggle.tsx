"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAttendanceType } from "@/app/actions/meetings";
import { cn } from "@/lib/cn";
import type { AttendanceType } from "@/lib/types";

interface Props {
  meetingId: string;
  adminToken: string;
  participantId: string;
  value: AttendanceType;
}

const OPTIONS: AttendanceType[] = ["required", "optional"];

export function AttendanceTypeToggle({
  meetingId,
  adminToken,
  participantId,
  value,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<AttendanceType>(value);
  const [saving, setSaving] = useState(false);

  async function change(next: AttendanceType) {
    if (next === optimistic || saving) return;
    setOptimistic(next);
    setSaving(true);
    const res = await updateAttendanceType({
      meetingId,
      adminToken,
      participantId,
      attendanceType: next,
    });
    setSaving(false);
    if (!res.ok) {
      setOptimistic(value); // 실패 시 롤백
      return;
    }
    // 추천 결과가 다시 계산되도록 서버 컴포넌트를 새로고침한다.
    startTransition(() => router.refresh());
  }

  const disabled = saving || isPending;

  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs"
      role="group"
      aria-label="참석 유형"
    >
      {OPTIONS.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => change(t)}
          disabled={disabled}
          aria-pressed={optimistic === t}
          className={cn(
            "px-2.5 py-1 font-semibold transition-colors disabled:opacity-60",
            optimistic === t
              ? "bg-brand-500 text-white"
              : "bg-white text-slate-500 hover:bg-slate-50",
          )}
        >
          {t === "required" ? "필수" : "선택"}
        </button>
      ))}
    </div>
  );
}
