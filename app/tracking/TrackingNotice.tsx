"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NOTICE_VISIBLE_MS = 3000;

export function TrackingNotice({
  text,
  tone,
}: {
  text: string;
  tone: "success" | "danger";
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setVisible(false);
      router.replace("/tracking", { scroll: false });
    }, NOTICE_VISIBLE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  if (!visible) return null;

  const className =
    tone === "success"
      ? "border-emerald-400/40 text-emerald-200"
      : "border-red-400/40 text-red-200";

  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={`mb-4 border px-3 py-2 text-xs ${className}`}
    >
      [{tone}] {text}
    </p>
  );
}
