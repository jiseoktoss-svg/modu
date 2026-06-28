import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

interface EmojiProps {
  /** 이모지 문자 (TossFace 폰트로 렌더링됨) */
  symbol: string;
  /** 픽셀 크기 — 폰트 크기로 적용한다. 기존 lucide `size` 값과 동일하게 쓴다. */
  size?: number;
  /** 스크린리더용 라벨. 주어지면 role="img", 없으면 장식용으로 보고 aria-hidden 처리. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * 유니코드 이모지를 일정한 크기로 렌더링하는 헬퍼.
 * 이모지 코드포인트는 globals.css 의 @font-face(unicode-range)에 의해
 * 자동으로 TossFace 폰트로 그려진다. (기존 lucide 아이콘 대체용)
 */
export function Emoji({ symbol, size = 16, label, className, style }: EmojiProps) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center leading-none",
        className,
      )}
      style={{ fontSize: size, lineHeight: 1, ...style }}
    >
      {symbol}
    </span>
  );
}
