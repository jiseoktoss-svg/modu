"use client";

import { useState } from "react";
import { confirmSlot } from "@/app/actions/meetings";
import { TDSButton } from "@/components/ui/TDSButton";

interface Props {
  meetingId: string;
  adminToken: string;
  startAt: string;
  endAt: string;
  label?: string;
}

export function ConfirmSlotButton({ meetingId, adminToken, startAt, endAt, label }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doConfirm() {
    setLoading(true);
    setError(null);
    // 성공하면 서버 액션이 confirmed 화면으로 redirect 하므로 이 아래는 실행되지 않는다.
    const res = await confirmSlot({ meetingId, adminToken, startAt, endAt });
    if (res && !res.ok) {
      setError(res.error);
      setLoading(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <TDSButton onClick={() => setConfirming(true)} display="block">
        {label ?? "이 시간으로 확정"}
      </TDSButton>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50 p-3">
      <p className="text-sm font-medium text-slate-700">이 시간으로 회의를 확정할까요?</p>
      {error && (
        <p className="text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <TDSButton onClick={doConfirm} disabled={loading} loading={loading} size="lg">
          {loading ? "확정 중…" : "네, 확정할게요"}
        </TDSButton>
        <TDSButton
          tone="ghost"
          size="lg"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          취소
        </TDSButton>
      </div>
    </div>
  );
}
