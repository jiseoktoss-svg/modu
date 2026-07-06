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

// 화면 상단의 [뒤로가기 + 타이틀]을 렌더한다.
//  - 모바일: SiteHeader 의 고정 헤더 슬롯에 포털(슬롯은 sm:hidden 이라 모바일 전용).
//  - 데스크톱: 본문 상단(이 컴포넌트 호출 위치)에 인라인.
// 화면(단계)마다 하나만 렌더한다 — 단계가 바뀌면 타이틀도 함께 바뀐다.
// onBack: 화면 안 단계를 되돌리는 커스텀 동작. 없으면 브라우저 히스토리 뒤로.
// hideBack: 뒤로 갈 곳이 없는 화면(회의 안내·응답 완료·공유·확정 등)은 데스크톱 인라인을
//   그리지 않고(본문의 기존 타이틀 사용), 모바일 헤더도 버튼 없이 타이틀만 보여준다.
export function MobileHeaderTitle({
  title,
  onBack,
  hideBack = false,
}: {
  title: string;
  onBack?: () => void;
  hideBack?: boolean;
}) {
  const router = useRouter();
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("modu-mobile-header-slot"));
  }, []);

  const backButton = !hideBack && (
    <button
      type="button"
      onClick={() => (onBack ? onBack() : router.back())}
      aria-label="뒤로 가기"
      className="-ml-2 mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-200 sm:ml-0"
    >
      <BackIcon />
    </button>
  );
  const titleText = (
    <span className="truncate text-sm font-medium text-slate-400">{title}</span>
  );

  return (
    <>
      {/* 모바일: 고정 헤더 슬롯에 포털(슬롯이 sm:hidden 이라 모바일에서만 보임). */}
      {slot &&
        createPortal(
          <>
            {backButton}
            {titleText}
          </>,
          slot,
        )}
      {/* 데스크톱: 뒤로가기 있는 화면만 본문 상단에 인라인. hideBack 화면은 본문 기존 타이틀 사용. */}
      {!hideBack && (
        <div className="hidden items-center sm:flex">
          {backButton}
          {titleText}
        </div>
      )}
    </>
  );
}
