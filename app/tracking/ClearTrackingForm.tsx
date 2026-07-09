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
        className="h-8 border border-red-400/40 bg-black px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-red-200 transition-colors hover:border-red-200 hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-200 focus:ring-offset-2 focus:ring-offset-black disabled:cursor-not-allowed disabled:border-zinc-800 disabled:text-zinc-700"
      >
        purge logs
      </button>
    </form>
  );
}
