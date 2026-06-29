import { useEffect } from "react";

// 모달이 열려 있는 동안 배경(body) 스크롤을 막는다.
// iOS Safari 는 body { overflow: hidden } 만으로는 막히지 않으므로,
// body 를 현재 스크롤 위치에 position: fixed 로 고정했다가 닫힐 때 복원한다.
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
