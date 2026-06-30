import { useEffect } from "react";

// 모달이 열려 있는 동안 배경(body) 스크롤을 막는다.
// iOS Safari 는 body { overflow: hidden } 만으로는 막히지 않으므로,
// body 를 현재 스크롤 위치에 position: fixed 로 고정했다가 닫힐 때 복원한다.
//
// 모달이 중첩될 수 있으므로(예: 전체화면 시트 안에서 시간 선택 모달이 또 열림)
// ref-count 로 관리한다: 첫 잠금에서만 스타일을 적용하고, 마지막 해제에서만 복원한다.
// 이렇게 하면 해제 순서(예: Esc 로 두 모달이 동시에 닫힘)와 무관하게 항상 올바르게 복원된다.
let lockCount = 0;
let savedScrollY = 0;
let savedStyle: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
} | null = null;

export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;

    if (lockCount === 0) {
      savedScrollY = window.scrollY;
      savedStyle = {
        position: body.style.position,
        top: body.style.top,
        left: body.style.left,
        right: body.style.right,
        width: body.style.width,
        overflow: body.style.overflow,
      };
      body.style.position = "fixed";
      body.style.top = `-${savedScrollY}px`;
      body.style.left = "0";
      body.style.right = "0";
      body.style.width = "100%";
      body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && savedStyle) {
        body.style.position = savedStyle.position;
        body.style.top = savedStyle.top;
        body.style.left = savedStyle.left;
        body.style.right = savedStyle.right;
        body.style.width = savedStyle.width;
        body.style.overflow = savedStyle.overflow;
        savedStyle = null;
        window.scrollTo(0, savedScrollY);
      }
    };
  }, [locked]);
}
