"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

function BackIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 모바일 헤더(SiteHeader 의 슬롯)에 뒤로가기 버튼 + 현재 화면 타이틀을 포털로 채운다.
// 화면(단계)마다 하나만 렌더한다 — 단계가 바뀌면 헤더 타이틀도 함께 바뀐다.
// 데스크톱(sm+)에서는 슬롯 자체가 숨겨져 아무것도 보이지 않는다.
// onBack: 화면 안 단계를 되돌리는 커스텀 동작. 없으면 브라우저 히스토리 뒤로.
export function MobileHeaderTitle({
  title,
  onBack,
}: {
  title: string;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("modu-mobile-header-slot"));
  }, []);

  if (!slot) return null;

  return createPortal(
    <>
      <button
        type="button"
        onClick={() => (onBack ? onBack() : router.back())}
        aria-label="뒤로 가기"
        className="-ml-2 mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200"
      >
        <BackIcon />
      </button>
      <span className="truncate text-sm font-medium text-slate-400">{title}</span>
    </>,
    slot,
  );
}
