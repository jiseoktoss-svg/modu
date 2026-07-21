"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  fetchBlocks,
  fetchBlocksForParticipant,
  fetchMeeting,
  fetchParticipants,
  toSchedulerMeeting,
} from "@/lib/data";
import { MAX_MEMO_LENGTH, validateSubmittedBlocks } from "@/lib/scheduler";
import {
  createDemoMeetingId,
  createDemoSelfParticipant,
  getDemoSelfParticipant,
  getDemoParticipants,
  isDemoMeetingId,
} from "@/lib/demoMeeting";
import { getSupabaseAdmin, hasSupabaseConfig } from "@/lib/supabase/server";
import { generateToken } from "@/lib/tokens";
import { addDaysToDateStr, kstWallToIso, parseHm, todayDateStrKst } from "@/lib/time";
import type { ParticipantRow } from "@/lib/types";
import {
  MAX_MEETING_AGENDA_LENGTH,
  MAX_MEETING_LOCATION_LENGTH,
  MAX_MEETING_PARTICIPANTS,
  MAX_MEETING_TITLE_LENGTH,
} from "@/lib/meetingLimits";
import {
  normalizeParticipantName,
  participantNameKey,
  validateParticipantName,
} from "@/lib/participantIdentity";
import {
  DISABLED_BREAK_END,
  DISABLED_BREAK_START,
  MAX_SCHEDULE_DURATION_MINUTES,
  SCHEDULE_DAY_END,
  SCHEDULE_DAY_START,
} from "@/lib/schedulingPolicy";
import type {
  FormState,
  LoadCalendarSnapshotArgs,
  LoadCalendarSnapshotResult,
  LoadResponseArgs,
  LoadResponseResult,
  JoinMeetingArgs,
  JoinMeetingResult,
  SubmitAvailabilityArgs,
  SubmitResult,
} from "@/lib/actionTypes";

const MEETING_STORAGE_ERROR_MESSAGE =
  "일정 링크를 만드는 중에 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

function logMeetingStorageError(context: string, error: unknown) {
  console.error(`[meetings] ${context}`, error);
}

function getMeetingStorage() {
  try {
    return { ok: true as const, sb: getSupabaseAdmin() };
  } catch (error) {
    logMeetingStorageError("failed to initialize Supabase client", error);
    return { ok: false as const, error: MEETING_STORAGE_ERROR_MESSAGE };
  }
}

// ---- 회의 생성 ----

export async function createMeeting(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawTitle = String(formData.get("title") ?? "");
  const rawAgenda = String(formData.get("agenda") ?? "");
  const rawLocation = String(formData.get("location") ?? "");
  const title = rawTitle.trim();
  const agenda = rawAgenda.trim();
  const location = rawLocation.trim();
  const rawDurationMinutes = formData.get("durationMinutes");
  const durationHours = Number(formData.get("durationHours") ?? 0);
  const durationMinutePart = Number(formData.get("durationMinutePart") ?? 0);
  const durationMinutes =
    rawDurationMinutes != null && String(rawDurationMinutes).trim() !== ""
      ? Number(rawDurationMinutes)
      : durationHours * 60 + durationMinutePart;
  const deadlineDate = String(
    formData.get("deadlineDate") ?? formData.get("meetingDate") ?? "",
  ).trim();
  const responseDeadlineDate = String(formData.get("responseDeadlineDate") ?? "").trim();
  const responseDeadlineTime = String(formData.get("responseDeadlineTime") ?? "").trim();
  const dateStart = todayDateStrKst(new Date());
  const dateEnd = deadlineDate;
  const workdayStart = SCHEDULE_DAY_START;
  const workdayEnd = SCHEDULE_DAY_END;
  const lunchStart = DISABLED_BREAK_START;
  const lunchEnd = DISABLED_BREAK_END;

  // 검증
  if (!title) return { error: "일정 이름을 입력해 주세요." };
  if (rawTitle.length > MAX_MEETING_TITLE_LENGTH) {
    return { error: `일정 이름은 최대 ${MAX_MEETING_TITLE_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (!agenda) return { error: "일정 내용을 입력해 주세요." };
  if (rawAgenda.length > MAX_MEETING_AGENDA_LENGTH) {
    return { error: `일정 내용은 최대 ${MAX_MEETING_AGENDA_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (!location) return { error: "장소를 입력해 주세요." };
  if (rawLocation.length > MAX_MEETING_LOCATION_LENGTH) {
    return { error: `장소는 최대 ${MAX_MEETING_LOCATION_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (!deadlineDate) {
    return { error: "일정 후보의 마지막 날을 선택해 주세요." };
  }
  const minDeadlineDate = addDaysToDateStr(dateStart, 2);
  if (deadlineDate < minDeadlineDate) {
    return { error: "일정 후보의 마지막 날은 오늘부터 이틀 뒤부터 고를 수 있어요." };
  }

  // 응답 마감일(날짜 + 시간). 폼에서 항상 전송되지만, 없으면 null 로 둔다(구버전 데모 링크 호환).
  let responseDeadline: string | null = null;
  if (responseDeadlineDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(responseDeadlineDate)) {
      return { error: "응답 마감 날짜를 다시 확인해 주세요." };
    }
    if (responseDeadlineTime && !/^\d{2}:\d{2}$/.test(responseDeadlineTime)) {
      return { error: "응답 마감 시간을 다시 확인해 주세요." };
    }
    if (responseDeadlineDate < dateStart) {
      return { error: "응답 마감 날짜는 오늘 이후로 선택해 주세요." };
    }
    if (responseDeadlineDate > addDaysToDateStr(dateEnd, -2)) {
      return { error: "응답 마감 날짜는 일정 후보의 마지막 날보다 이틀 이상 빨라야 해요." };
    }
    responseDeadline = kstWallToIso(responseDeadlineDate, parseHm(responseDeadlineTime || "18:00"));
  }
  if (
    !Number.isFinite(durationHours) ||
    !Number.isFinite(durationMinutePart) ||
    durationHours < 0 ||
    durationMinutePart < 0 ||
    durationMinutePart > 59 ||
    !Number.isInteger(durationHours) ||
    !Number.isInteger(durationMinutePart)
  ) {
    return { error: "소요 시간을 시간과 분으로 올바르게 입력해 주세요." };
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "소요 시간을 1분 이상으로 입력해 주세요." };
  }
  const ws = parseHm(workdayStart);
  const we = parseHm(workdayEnd);
  if (!(ws < we)) return { error: "근무 시작 시간은 종료 시간보다 빨라야 해요." };
  if (durationMinutes > MAX_SCHEDULE_DURATION_MINUTES) {
    return { error: "진행 시간은 24시간 이내로 입력해 주세요." };
  }

  if (process.env.NODE_ENV === "production" && !hasSupabaseConfig()) {
    const demoMeetingId = createDemoMeetingId({
      title,
      agenda,
      location,
      durationMinutes,
      dateStart,
      dateEnd,
      workdayStart,
      workdayEnd,
      lunchStart,
      lunchEnd,
      responseDeadline,
      participants: [],
    });
    redirect(`/meetings/${demoMeetingId}/share`);
  }

  const storage = getMeetingStorage();
  if (!storage.ok) return { error: storage.error };
  const { sb } = storage;

  const internalMeetingToken = generateToken();

  const { data: meetingData, error: meetingError } = await sb
    .from("meetings")
    .insert({
      title,
      agenda,
      location,
      duration_minutes: durationMinutes,
      date_start: dateStart,
      date_end: dateEnd,
      workday_start: workdayStart,
      workday_end: workdayEnd,
      lunch_start: lunchStart,
      lunch_end: lunchEnd,
      response_deadline: responseDeadline,
      admin_token: internalMeetingToken,
    })
    .select("id")
    .single();

  if (meetingError || !meetingData) {
    logMeetingStorageError("failed to create meeting", meetingError);
    return { error: "일정을 만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  redirect(`/meetings/${meetingData.id as string}/share`);
}

// ---- 링크 접속자 참여 등록 ----

export async function joinMeeting(args: JoinMeetingArgs): Promise<JoinMeetingResult> {
  const nameError = validateParticipantName(args.name);
  if (nameError) return { ok: false, error: nameError };
  const name = normalizeParticipantName(args.name);
  const joinKey = participantNameKey(name);

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "일정을 찾지 못했어요." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 시간이 정해진 일정이라 응답할 수 없어요." };
  }

  if (isDemoMeetingId(args.meetingId)) {
    const participant = createDemoSelfParticipant(args.meetingId, name);
    if (!participant) return { ok: false, error: "일정에 참여하지 못했어요." };
    return {
      ok: true,
      participantId: participant.id,
      name: participant.name,
      role: participant.role,
      attendanceType: participant.attendanceType,
      responseStatus: participant.responseStatus,
      token: participant.participantToken,
    };
  }

  const participants = await fetchParticipants(args.meetingId);
  const existing = participants.find((participant) => participantNameKey(participant.name) === joinKey);
  if (existing) {
    // 기존 방식으로 미리 등록된 일정은 역할 값이 있다. 아직 응답 전이면 이름만으로 참여를 이어간다.
    if (existing.role.trim() && existing.responseStatus === "pending") {
      return {
        ok: true,
        participantId: existing.id,
        name: existing.name,
        role: existing.role,
        attendanceType: existing.attendanceType,
        responseStatus: existing.responseStatus,
        token: existing.participantToken,
      };
    }
    return { ok: false, error: "이미 사용 중인 이름이에요. 구분되는 별명을 입력해 주세요." };
  }

  if (participants.length >= MAX_MEETING_PARTICIPANTS) {
    return { ok: false, error: `이 일정에는 최대 ${MAX_MEETING_PARTICIPANTS}명까지 참여할 수 있어요.` };
  }

  const storage = getMeetingStorage();
  if (!storage.ok) return { ok: false, error: storage.error };
  const participantToken = generateToken();
  const { data, error } = await storage.sb
    .from("participants")
    .insert({
      meeting_id: args.meetingId,
      name,
      role: "",
      attendance_type: "optional",
      response_status: "pending",
      participant_token: participantToken,
      join_key: joinKey,
    })
    .select("*")
    .single();

  if (error || !data) {
    const duplicate = (error as { code?: string } | null)?.code === "23505";
    if (duplicate) {
      return { ok: false, error: "이미 사용 중인 이름이에요. 구분되는 별명을 입력해 주세요." };
    }
    logMeetingStorageError("failed to join meeting", error);
    return { ok: false, error: "일정에 참여하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  const participant = data as ParticipantRow;
  return {
    ok: true,
    participantId: participant.id,
    name: participant.name,
    role: participant.role,
    attendanceType: participant.attendance_type,
    responseStatus: participant.response_status,
    token: participant.participant_token,
  };
}

// ---- 응답 제출/수정 ----

export async function submitAvailability(args: SubmitAvailabilityArgs): Promise<SubmitResult> {
  if ((args.memo ?? "").length > MAX_MEMO_LENGTH) {
    return { ok: false, error: "메모가 너무 길어요." };
  }

  if (isDemoMeetingId(args.meetingId)) {
    const meeting = await fetchMeeting(args.meetingId);
    const participant = await assertParticipantToken(
      args.meetingId,
      args.participantId,
      args.token ?? "",
    );
    if (!meeting || !participant) return { ok: false, error: "참여자를 찾지 못했어요." };

    const blockCheck = validateSubmittedBlocks(toSchedulerMeeting(meeting), args.blocks);
    if (!blockCheck.ok) return { ok: false, error: blockCheck.reason };

    return { ok: true, participantId: participant.id, token: participant.participant_token };
  }

  const sb = getSupabaseAdmin();

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "일정을 찾지 못했어요." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 시간이 정해진 일정은 응답을 수정할 수 없어요." };
  }

  const { data: pData, error: pErr } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (pErr || !pData) return { ok: false, error: "참여자를 찾지 못했어요." };

  const participant = pData as ParticipantRow;
  if (participant.meeting_id !== args.meetingId) {
    return { ok: false, error: "잘못된 요청이에요." };
  }

  // 이미 제출한 응답은 같은 브라우저(토큰 일치)에서만 수정할 수 있다.
  if (participant.response_status === "submitted") {
    if (!args.token || args.token !== participant.participant_token) {
      return {
        ok: false,
        error: "처음 제출한 브라우저에서만 수정할 수 있어요.",
      };
    }
  }

  // 제출 블록 서버 검증(클라이언트 우회 방어): 날짜 범위·근무 시간·점심·30분·개수.
  const blockCheck = validateSubmittedBlocks(toSchedulerMeeting(meeting), args.blocks);
  if (!blockCheck.ok) return { ok: false, error: blockCheck.reason };

  // 기존 응답을 교체한다.
  const { error: delErr } = await sb
    .from("availability_blocks")
    .delete()
    .eq("participant_id", args.participantId);
  if (delErr) return { ok: false, error: "응답을 저장하지 못했어요." };

  if (args.blocks.length > 0) {
    const rows = args.blocks.map((b) => ({
      meeting_id: args.meetingId,
      participant_id: args.participantId,
      start_at: b.startAt,
      end_at: b.endAt,
      status: b.status,
      note: b.note ?? null,
    }));
    const { error: insErr } = await sb.from("availability_blocks").insert(rows);
    if (insErr) return { ok: false, error: "응답을 저장하지 못했어요." };
  }

  // 메모는 블록 유무와 무관하게 참석자 레코드에 저장한다(빈 시간표여도 메모 보존).
  const memo = args.memo?.trim() || null;
  const { error: updErr } = await sb
    .from("participants")
    .update({ response_status: "submitted", memo, updated_at: new Date().toISOString() })
    .eq("id", args.participantId);
  if (updErr) return { ok: false, error: "응답을 저장하지 못했어요." };

  // 투표도 자동 확정도 없다 — modu 는 회의 시간을 확정하지 않는다.
  // 응답 저장 후 추천안 화면이 전체 응답을 해석해 보여주고, 최종 결정은 참여자들이 제품 밖에서 한다.
  revalidatePath(`/m/${args.meetingId}`);

  return { ok: true, participantId: args.participantId, token: participant.participant_token };
}

// ---- 본인 응답 불러오기(수정용) ----

export async function loadParticipantResponse(
  args: LoadResponseArgs,
): Promise<LoadResponseResult> {
  if (isDemoMeetingId(args.meetingId)) {
    const participant = await assertParticipantToken(args.meetingId, args.participantId, args.token);
    return participant
      ? {
          ok: true,
          blocks: [],
          memo: null,
          responseStatus: participant.response_status,
        }
      : { ok: false, error: "권한이 없어요." };
  }

  const sb = getSupabaseAdmin();
  const { data: pData } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (!pData) return { ok: false, error: "참여자를 찾지 못했어요." };

  const participant = pData as ParticipantRow;
  if (participant.meeting_id !== args.meetingId || participant.participant_token !== args.token) {
    return { ok: false, error: "권한이 없어요." };
  }

  const blocks = await fetchBlocksForParticipant(args.meetingId, args.participantId);
  return {
    ok: true,
    blocks: blocks.map((b) => ({
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
      note: b.note,
    })),
    memo: participant.memo ?? null,
    responseStatus: participant.response_status,
  };
}

export async function loadCalendarSnapshot(
  args: LoadCalendarSnapshotArgs,
): Promise<LoadCalendarSnapshotResult> {
  const participant = await assertParticipantToken(
    args.meetingId,
    args.participantId,
    args.token,
  );
  if (!participant) return { ok: false, error: "권한이 없어요." };

  const [meeting, participants, blocks] = await Promise.all([
    fetchMeeting(args.meetingId),
    fetchParticipants(args.meetingId),
    fetchBlocks(args.meetingId),
  ]);
  if (!meeting) return { ok: false, error: "일정을 찾지 못했어요." };

  return {
    ok: true,
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      attendanceType: p.attendanceType,
      responseStatus: p.responseStatus,
    })),
    blocks: blocks.map((b) => ({
      participantId: b.participantId,
      startAt: b.startAt,
      endAt: b.endAt,
      status: b.status,
    })),
  };
}

async function assertParticipantToken(
  meetingId: string,
  participantId: string,
  token: string,
): Promise<ParticipantRow | null> {
  const demoParticipants = getDemoParticipants(meetingId);
  if (demoParticipants) {
    const participant = demoParticipants.find(
      (p) => p.id === participantId && p.participantToken === token,
    ) ?? getDemoSelfParticipant(meetingId, participantId, token);
    if (!participant) return null;
    return {
      id: participant.id,
      meeting_id: participant.meetingId,
      name: participant.name,
      role: participant.role,
      attendance_type: participant.attendanceType,
      response_status: participant.responseStatus,
      participant_token: participant.participantToken,
      memo: participant.memo,
      created_at: participant.createdAt,
      updated_at: participant.updatedAt,
    };
  }

  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("participants")
    .select("*")
    .eq("id", participantId)
    .maybeSingle();
  if (!data) return null;
  const participant = data as ParticipantRow;
  if (participant.meeting_id !== meetingId || participant.participant_token !== token) return null;
  return participant;
}
