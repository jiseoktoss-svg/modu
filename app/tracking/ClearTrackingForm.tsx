"use client";

import { type FormEvent } from "react";

interface ClearTrackingFormProps {
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}

export function ClearTrackingForm({
  action,
  disabled = false,
}: ClearTrackingFormProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      "트래킹 기록을 모두 삭제할까요? 삭제한 기록은 되돌릴 수 없습니다.",
    );

    if (!confirmed) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={disabled}
        className="h-10 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        기록 지우기
      </button>
    </form>
  );
}
