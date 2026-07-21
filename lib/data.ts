import "server-only";
import { getDemoMeeting, getDemoParticipants, isDemoMeetingId } from "@/lib/demoMeeting";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { SchedulerInput, SchedulerMeeting } from "@/lib/scheduler";
import { SCHEDULE_DAY_END, SCHEDULE_DAY_START } from "@/lib/schedulingPolicy";
import {
  mapAvailabilityBlock,
  mapConfirmedSlot,
  mapMeeting,
  mapParticipant,
  type AvailabilityBlock,
  type AvailabilityBlockRow,
  type AttendanceType,
  type ConfirmedSlot,
  type ConfirmedSlotRow,
  type Meeting,
  type MeetingRow,
  type Participant,
  type ParticipantRow,
  type ResponseStatus,
} from "@/lib/types";

export async function fetchMeeting(id: string): Promise<Meeting | null> {
  const demoMeeting = getDemoMeeting(id);
  if (demoMeeting) return demoMeeting;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("meetings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapMeeting(data as MeetingRow) : null;
}

export async function fetchParticipants(meetingId: string): Promise<Participant[]> {
  const demoParticipants = getDemoParticipants(meetingId);
  if (demoParticipants) return demoParticipants;

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("participants")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as ParticipantRow[]).map(mapParticipant);
}

export async function fetchBlocks(meetingId: string): Promise<AvailabilityBlock[]> {
  if (isDemoMeetingId(meetingId)) return [];

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("availability_blocks")
    .select("*")
    .eq("meeting_id", meetingId);
  if (error) throw error;
  return (data as AvailabilityBlockRow[]).map(mapAvailabilityBlock);
}

export async function fetchBlocksForParticipant(
  meetingId: string,
  participantId: string,
): Promise<AvailabilityBlock[]> {
  if (isDemoMeetingId(meetingId)) return [];

  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("availability_blocks")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("participant_id", participantId);
  if (error) throw error;
  return (data as AvailabilityBlockRow[]).map(mapAvailabilityBlock);
}

export async function fetchConfirmedSlot(slotId: string): Promise<ConfirmedSlot | null> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("confirmed_slots")
    .select("*")
    .eq("id", slotId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapConfirmedSlot(data as ConfirmedSlotRow) : null;
}

// 클라이언트로 내려보내는 참석자 공개 형태 — 토큰은 절대 포함하지 않는다.
export interface PublicParticipant {
  id: string;
  name: string;
  role: string;
  attendanceType: AttendanceType;
  responseStatus: ResponseStatus;
}

export function toPublicParticipant(p: Participant): PublicParticipant {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    attendanceType: p.attendanceType,
    responseStatus: p.responseStatus,
  };
}

/**
 * 특정 시간 슬롯에 대해 "필수 참석자가 모두 가능한가"를 직접 판정한다.
 * (추천 후보 목록 밖의 시간이어도 정확히 계산되도록 별도 함수로 둔다.)
 * 필수 참석자가 모두 submitted 이고, 그 누구도 슬롯과 겹치는 busy 가 없을 때 true.
 */
export function isRequiredAllAvailable(
  participants: Participant[],
  blocks: AvailabilityBlock[],
  startAt: string,
  endAt: string,
): boolean {
  const s = Date.parse(startAt);
  const e = Date.parse(endAt);
  return participants
    .filter((p) => p.attendanceType === "required")
    .every((p) => {
      if (p.responseStatus !== "submitted") return false;
      const busy = blocks.some(
        (b) =>
          b.participantId === p.id &&
          b.status === "busy" &&
          Date.parse(b.startAt) < e &&
          s < Date.parse(b.endAt),
      );
      return !busy;
    });
}

// 회의 도메인 객체에서 스케줄러용 회의 조건만 추출한다(검증/후보 생성 공용).
export function toSchedulerMeeting(meeting: Meeting): SchedulerMeeting {
  return {
    durationMinutes: meeting.durationMinutes,
    dateStart: meeting.dateStart,
    dateEnd: meeting.dateEnd,
    // 현재 제품 정책은 기존에 만들어진 일정까지 요일 무관 하루 전체를 사용한다.
    workdayStart: SCHEDULE_DAY_START,
    workdayEnd: SCHEDULE_DAY_END,
    lunchStart: meeting.lunchStart,
    lunchEnd: meeting.lunchEnd,
  };
}

// 도메인 데이터를 추천 알고리즘 입력으로 변환한다.
export function toSchedulerInput(
  meeting: Meeting,
  participants: Participant[],
  blocks: AvailabilityBlock[],
  maxCandidates?: number,
): SchedulerInput {
  return {
    meeting: {
      durationMinutes: meeting.durationMinutes,
      dateStart: meeting.dateStart,
      dateEnd: meeting.dateEnd,
      workdayStart: SCHEDULE_DAY_START,
      workdayEnd: SCHEDULE_DAY_END,
      lunchStart: meeting.lunchStart,
      lunchEnd: meeting.lunchEnd,
    },
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      attendanceType: p.attendanceType,
      responseStatus: p.responseStatus,
    })),
    blocks: blocks.map((b) => ({
      participantId: b.participantId,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
    })),
    maxCandidates,
  };
}
