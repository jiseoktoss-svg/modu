// 글자 잉크 채움(char fill) 공용 타이밍·유틸.
// 렌더링은 components/ui/CharFillSentence.tsx 가 담당하고,
// 회의 확인(MeetingCreateForm)·회의 안내(MeetingSummarySentence)·입력 확인(ResponseForm review)이 함께 쓴다.
// 경계가 글자마다 리셋되며 뚝뚝 끊기지 않게, 이웃 글자와 살짝 겹치며 진행한다(시차 < 지속).
// 공백은 시간 슬롯을 차지하지 않고, 좁은 문장부호는 절반 슬롯만 차지해 흐름을 유지한다.

import type { ReactNode } from "react";

export const CHAR_FILL_STEP_MS = 60; // 다음 글자가 칠해지기 시작할 때까지의 시차(체감 속도)
export const CHAR_FILL_DURATION_MS = 220; // 글자 하나가 칠해지는 시간(경계가 이웃 글자에 걸침)
export const CHAR_FILL_CLAUSE_GAP_MS = 200; // 절(문장) 사이 호흡

/**
 * 채움 문장의 조각. 일반 텍스트 문자열이거나, 강조 값(wrap 으로 껍데기를 주입 —
 * EditValue 버튼·shine span 등. chars 는 글자 span 목록, shine 은 채움 완료 여부).
 */
export type CharFillSegment =
  | string
  | { text: string; wrap: (chars: ReactNode, shine: boolean) => ReactNode };

/** 조각의 순수 텍스트(슬롯 계산용). */
export function segmentText(seg: CharFillSegment): string {
  return typeof seg === "string" ? seg : seg.text;
}

/** 글자 단위 분해. 조합 이모지 등이 깨지지 않게 가능하면 grapheme 단위로 자른다. */
export function splitGraphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return Array.from(
      new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/** 글자별 시간 슬롯: 공백 0(칠할 게 없어 멈칫하게 만들 뿐) · 좁은 문장부호 0.5 · 일반 글자 1. */
export function charFillSlot(ch: string): number {
  if (ch === " ") return 0;
  return /^[,.!?:;·…]$/.test(ch) ? 0.5 : 1;
}

/** 문자열이 차지하는 슬롯 합. */
export function countCharFillSlots(text: string): number {
  return splitGraphemes(text).reduce((n, ch) => n + charFillSlot(ch), 0);
}

/**
 * 절 목록의 채움 타이밍: 절별 시작 시각(슬롯 수 비례 + 절 사이 호흡)과
 * 마지막 글자가 다 칠해지는 시각(= mask 를 걷고 shine 을 켤 시각).
 * 안내 문구·CTA 등장 지연을 계산할 때 부모 화면에서도 쓴다.
 */
export function charFillTiming(clauses: CharFillSegment[][]): {
  clauseStartsMs: number[];
  fillEndMs: number;
} {
  const clauseStartsMs: number[] = [];
  let acc = 0;
  for (const segments of clauses) {
    clauseStartsMs.push(acc);
    const slots = segments.reduce((n, seg) => n + countCharFillSlots(segmentText(seg)), 0);
    acc += slots * CHAR_FILL_STEP_MS + CHAR_FILL_CLAUSE_GAP_MS;
  }
  const fillEndMs =
    clauses.length === 0
      ? 0
      : Math.max(
          0,
          acc - CHAR_FILL_CLAUSE_GAP_MS + (CHAR_FILL_DURATION_MS - CHAR_FILL_STEP_MS),
        );
  return { clauseStartsMs, fillEndMs };
}
