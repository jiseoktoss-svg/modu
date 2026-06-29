"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { TDSButton } from "@/components/ui/TDSButton";

interface StartMeetingButtonProps {
  display?: "inline" | "block";
  className?: string;
}

// 랜딩 CTA: 클릭하면 회의 만들기로 이동하며, 라우팅이 끝날 때까지 버튼 안에 로딩(점 3개)을 보여준다.
export function StartMeetingButton({ display = "inline", className }: StartMeetingButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <TDSButton
      type="button"
      size="xl"
      display={display}
      loading={pending}
      aria-label="회의 만들기"
      className={className}
      onClick={() => startTransition(() => router.push("/meetings/new"))}
    >
      {pending ? null : "회의 만들기"}
    </TDSButton>
  );
}
