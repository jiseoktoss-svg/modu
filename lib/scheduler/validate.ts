import { eachDateInRange, getKstParts, isoToEpoch, parseHm } from "@/lib/time";
import type { AvailabilityStatus } from "@/lib/types";
import { SLOT_STEP_MINUTES } from "./generateSlots";
import type { SchedulerMeeting, SchedulerParticipant } from "./types";

// 서버 측 검증 (클라이언트를 신뢰하지 않는다). UI/DB 비의존 순수 함수로 두어 테스트한다.

export const MAX_BLOCKS_PER_PARTICIPANT = 300;
export const MAX_MEMO_LENGTH = 500;
export const MAX_NOTE_LENGTH = 300;

const VALID_STATUSES: AvailabilityStatus[] = ["busy", "avoid", "preferred"];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface SubmittedBlock {
  startAt: string;
  endAt: string;
  status: AvailabilityStatus;
  note?: string | null;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateStrOf(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * (#1) 확정하려는 슬롯이 유효한지 서버에서 직접 판정한다.
 * 후보 "목록(top-N)" 포함 여부가 아니라, 후보 생성/제외 규칙을 그대로 적용한다.
 * - 회의 길이 일치, 30분 시작 정렬, 날짜 범위 안, 근무 시간 안
 * - 점심 시간과 비겹침
 * - 필수 참석자의 busy 와 충돌 없음
 */
export function isSlotConfirmable(
  meeting: SchedulerMeeting,
  participants: SchedulerParticipant[],
  blocks: { participantId: string; startAt: string; endAt: string; status: AvailabilityStatus }[],
  startAt: string,
  endAt: string,
): ValidationResult {
  const s = isoToEpoch(startAt);
  const e = isoToEpoch(endAt);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !(s < e)) {
    return { ok: false, reason: "시간 범위가 올바르지 않아요." };
  }
  if (e - s !== meeting.durationMinutes * 60000) {
    return { ok: false, reason: "회의 길이와 맞지 않는 시간이에요." };
  }

  const sp = getKstParts(startAt);
  const ep = getKstParts(endAt);
  const startMin = sp.hours * 60 + sp.minutes;
  const endMin = ep.hours * 60 + ep.minutes;

  // 같은 날 안이어야 하고, 날짜 범위 안이어야 한다.
  if (dateStrOf(sp) !== dateStrOf(ep)) {
    return { ok: false, reason: "하루를 벗어나는 시간이에요." };
  }
  if (!eachDateInRange(meeting.dateStart, meeting.dateEnd).includes(dateStrOf(sp))) {
    return { ok: false, reason: "회의 날짜 범위 밖의 시간이에요." };
  }

  const workStart = parseHm(meeting.workdayStart);
  const workEnd = parseHm(meeting.workdayEnd);
  if ((startMin - workStart) % SLOT_STEP_MINUTES !== 0) {
    return { ok: false, reason: "시작 시간은 30분 단위로 선택할 수 있어요." };
  }
  if (startMin < workStart || endMin > workEnd) {
    return { ok: false, reason: "근무 시간 밖의 시간이에요." };
  }

  const lunchStart = parseHm(meeting.lunchStart);
  const lunchEnd = parseHm(meeting.lunchEnd);
  if (overlaps(startMin, endMin, lunchStart, lunchEnd)) {
    return { ok: false, reason: "점심 시간과 겹치는 시간이에요." };
  }

  const requiredIds = new Set(
    participants.filter((p) => p.attendanceType === "required").map((p) => p.id),
  );
  const requiredBusy = blocks.some(
    (b) =>
      requiredIds.has(b.participantId) &&
      b.status === "busy" &&
      overlaps(s, e, isoToEpoch(b.startAt), isoToEpoch(b.endAt)),
  );
  if (requiredBusy) {
    return { ok: false, reason: "필수 참석자가 참석할 수 없는 시간이에요." };
  }

  return { ok: true };
}

/**
 * (#3) 참석자가 제출한 가용성 블록을 서버에서 검증한다.
 * - 개수 상한
 * - status 유효성, 시작 < 종료
 * - 하루 안 / 날짜 범위 안 / 근무 시간 안
 * - 30분 단위 정렬 및 30분 배수 길이
 * - 점심 시간과 비겹침
 * - note 길이 제한
 */
export function validateSubmittedBlocks(
  meeting: SchedulerMeeting,
  blocks: SubmittedBlock[],
): ValidationResult {
  if (blocks.length > MAX_BLOCKS_PER_PARTICIPANT) {
    return { ok: false, reason: "안 되는 시간을 너무 많이 입력했어요." };
  }

  const workStart = parseHm(meeting.workdayStart);
  const workEnd = parseHm(meeting.workdayEnd);
  const lunchStart = parseHm(meeting.lunchStart);
  const lunchEnd = parseHm(meeting.lunchEnd);
  const dates = new Set(eachDateInRange(meeting.dateStart, meeting.dateEnd));

  for (const b of blocks) {
    if (!VALID_STATUSES.includes(b.status)) {
      return { ok: false, reason: "알 수 없는 상태 값이 있어요." };
    }
    if (b.note != null && b.note.length > MAX_NOTE_LENGTH) {
      return { ok: false, reason: "메모가 너무 길어요." };
    }

    const s = isoToEpoch(b.startAt);
    const e = isoToEpoch(b.endAt);
    if (!Number.isFinite(s) || !Number.isFinite(e) || !(s < e)) {
      return { ok: false, reason: "시간 범위가 올바르지 않아요." };
    }

    const sp = getKstParts(b.startAt);
    const ep = getKstParts(b.endAt);
    if (dateStrOf(sp) !== dateStrOf(ep)) {
      return { ok: false, reason: "하루를 벗어나는 응답이 있어요." };
    }
    if (!dates.has(dateStrOf(sp))) {
      return { ok: false, reason: "회의 날짜 범위 밖의 응답이 있어요." };
    }

    const startMin = sp.hours * 60 + sp.minutes;
    const endMin = ep.hours * 60 + ep.minutes;
    if (startMin % SLOT_STEP_MINUTES !== 0 || (endMin - startMin) % SLOT_STEP_MINUTES !== 0) {
      return { ok: false, reason: "30분 단위가 아닌 응답이 있어요." };
    }
    if (startMin < workStart || endMin > workEnd) {
      return { ok: false, reason: "근무 시간 밖의 응답이 있어요." };
    }
    if (overlaps(startMin, endMin, lunchStart, lunchEnd)) {
      return { ok: false, reason: "점심 시간과 겹치는 응답이 있어요." };
    }
  }

  return { ok: true };
}
