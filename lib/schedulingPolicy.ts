/**
 * 모임 시간을 탐색하는 공용 범위.
 * 요일과 무관하게 하루 전체를 30분 단위 후보로 사용한다.
 */
export const SCHEDULE_DAY_START = "00:00";
export const SCHEDULE_DAY_END = "24:00";
export const MAX_SCHEDULE_DURATION_MINUTES = 24 * 60;

/** 시간대 입력을 열었을 때 먼저 보여줄 무난한 기본 범위. 선택 가능 범위와는 무관하다. */
export const DEFAULT_TIME_RANGE_START = "09:00";
export const DEFAULT_TIME_RANGE_END = "10:00";

/** 기존 스키마에서 휴식 시간 비활성화를 표현하는 값. */
export const DISABLED_BREAK_START = "00:00";
export const DISABLED_BREAK_END = "00:01";

export function isBreakWindowEnabled(start: string, end: string): boolean {
  return start !== DISABLED_BREAK_START || end !== DISABLED_BREAK_END;
}
