"use client";

import { useEffect, useState, type FormEvent } from "react";

interface ClearTrackingFormProps {
  action: (formData: FormData) => void | Promise<void>;
  disabled?: boolean;
}

export function ClearTrackingForm({
  action,
  disabled = false,
}: ClearTrackingFormProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (armed) return;
    event.preventDefault();
    setArmed(true);
  }

  return (
    <form action={action} onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={disabled}
        className="h-10 rounded-xl bg-red-50 px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {armed ? "한 번 더 눌러 삭제" : "기록 지우기"}
      </button>
    </form>
  );
}
