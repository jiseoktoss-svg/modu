import { eachDateInRange, kstWallToIso, parseHm } from "@/lib/time";
import { isBreakWindowEnabled } from "@/lib/schedulingPolicy";
import type { SchedulerMeeting } from "./types";

export interface RawSlot {
  startAt: string; // ISO (+09:00)
  endAt: string; // ISO (+09:00)
}

export const SLOT_STEP_MINUTES = 30;

/**
 * 후보 슬롯을 생성한다.
 * - 회의 날짜 범위 내 모든 날짜
 * - 설정된 하루 시간 범위 안에서만 (slotEnd <= workdayEnd)
 * - 30분 단위 시작
 * - 점심 시간과 겹치는 슬롯은 제외
 */
export function generateSlots(meeting: SchedulerMeeting): RawSlot[] {
  const workStart = parseHm(meeting.workdayStart);
  const workEnd = parseHm(meeting.workdayEnd);
  const lunchStart = parseHm(meeting.lunchStart);
  const lunchEnd = parseHm(meeting.lunchEnd);
  const excludeBreak = isBreakWindowEnabled(meeting.lunchStart, meeting.lunchEnd);
  const duration = meeting.durationMinutes;

  const slots: RawSlot[] = [];
  if (duration <= 0) return slots;

  for (const date of eachDateInRange(meeting.dateStart, meeting.dateEnd)) {
    for (
      let start = workStart;
      start + duration <= workEnd;
      start += SLOT_STEP_MINUTES
    ) {
      const end = start + duration;
      // 점심 시간과 겹치면 제외.
      if (excludeBreak && start < lunchEnd && lunchStart < end) continue;
      slots.push({
        startAt: kstWallToIso(date, start),
        endAt: kstWallToIso(date, end),
      });
    }
  }
  return slots;
}
