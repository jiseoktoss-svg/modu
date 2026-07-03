"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  fetchBlocks,
  fetchBlocksForParticipant,
  fetchMeeting,
  fetchParticipants,
  toSchedulerInput,
  toSchedulerMeeting,
} from "@/lib/data";
import {
  isSlotConfirmable,
  MAX_MEMO_LENGTH,
  validateSubmittedBlocks,
} from "@/lib/scheduler";
import {
  buildContextualScheduleResult,
  evaluateAllSlots,
  pickAutoConfirmSlot,
} from "@/lib/scheduler/contextualResult";
import { buildShareText } from "@/lib/share";
import {
  createDemoMeetingId,
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
  MIN_MEETING_PARTICIPANTS,
} from "@/lib/meetingLimits";
import type {
  FormState,
  LoadCalendarSnapshotArgs,
  LoadCalendarSnapshotResult,
  LoadResponseArgs,
  LoadResponseResult,
  SimpleResult,
  SubmitAvailabilityArgs,
  SubmitResult,
  VerifyParticipantIdentityArgs,
  VerifyParticipantIdentityResult,
} from "@/lib/actionTypes";

const MAX_ROLE_LENGTH = 40;
const DEFAULT_WORKDAY_START = "09:00";
const DEFAULT_WORKDAY_END = "18:00";
const DISABLED_LUNCH_START = "00:00";
const DISABLED_LUNCH_END = "00:01";
const MEETING_STORAGE_ERROR_MESSAGE =
  "회의 링크를 만드는 중에 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";

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

interface ParticipantSeed {
  name: string;
  role: string;
  attendanceType: "required" | "optional";
}

function parseParticipants(raw: string): ParticipantSeed[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((p): ParticipantSeed => ({
        name: String(p?.name ?? "").trim(),
        role: String(p?.role ?? "").trim(),
        attendanceType: p?.attendanceType === "required" ? "required" : "optional",
      }))
      .filter((p) => p.name.length > 0);
  } catch {
    return [];
  }
}

function normalizeIdentity(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
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
  const workdayStart = DEFAULT_WORKDAY_START;
  const workdayEnd = DEFAULT_WORKDAY_END;
  const lunchStart = DISABLED_LUNCH_START;
  const lunchEnd = DISABLED_LUNCH_END;
  const participants = parseParticipants(String(formData.get("participants") ?? "[]"));

  // 검증
  if (!title) return { error: "회의명을 입력해 주세요." };
  if (rawTitle.length > MAX_MEETING_TITLE_LENGTH) {
    return { error: `회의명은 최대 ${MAX_MEETING_TITLE_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (!agenda) return { error: "회의 안건을 입력해 주세요." };
  if (rawAgenda.length > MAX_MEETING_AGENDA_LENGTH) {
    return { error: `회의 안건은 최대 ${MAX_MEETING_AGENDA_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (!location) return { error: "회의 장소를 입력해 주세요." };
  if (rawLocation.length > MAX_MEETING_LOCATION_LENGTH) {
    return { error: `회의 장소는 최대 ${MAX_MEETING_LOCATION_LENGTH}글자까지 입력할 수 있어요.` };
  }
  if (participants.length < MIN_MEETING_PARTICIPANTS) {
    return { error: `참석자를 ${MIN_MEETING_PARTICIPANTS}명 이상 선택해 주세요.` };
  }
  if (participants.length > MAX_MEETING_PARTICIPANTS) {
    return { error: `참석자는 최대 ${MAX_MEETING_PARTICIPANTS}명까지 선택할 수 있어요.` };
  }
  if (!deadlineDate) {
    return { error: "회의 마감 날짜를 선택해 주세요." };
  }
  const minDeadlineDate = addDaysToDateStr(dateStart, 2);
  if (deadlineDate < minDeadlineDate) {
    return { error: "회의가 끝나야 하는 날은 오늘부터 이틀 뒤부터 고를 수 있어요." };
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
      return { error: "응답 마감 날짜는 회의 마감 날짜보다 이틀 이상 빨라야 해요." };
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
    return { error: "회의 길이를 시간과 분으로 올바르게 입력해 주세요." };
  }
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "회의 길이를 1분 이상으로 입력해 주세요." };
  }
  const ws = parseHm(workdayStart);
  const we = parseHm(workdayEnd);
  if (!(ws < we)) return { error: "근무 시작 시간은 종료 시간보다 빨라야 해요." };
  if (durationMinutes > we - ws) return { error: "회의 길이를 근무 시간 안으로 줄여 주세요." };

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
      participants,
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
    return { error: "회의를 만들지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  const meetingId = meetingData.id as string;
  const participantRows = participants.map((p) => ({
    meeting_id: meetingId,
    name: p.name,
    role: p.role,
    attendance_type: p.attendanceType,
    participant_token: generateToken(),
  }));

  const { error: participantError } = await sb.from("participants").insert(participantRows);
  if (participantError) {
    logMeetingStorageError("failed to insert participants", participantError);
    return { error: "참석자를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }

  redirect(`/meetings/${meetingId}/share`);
}

// ---- 참석자 본인 확인 ----

export async function verifyParticipantIdentity(
  args: VerifyParticipantIdentityArgs,
): Promise<VerifyParticipantIdentityResult> {
  const name = normalizeIdentity(args.name);
  const role = normalizeIdentity(args.role);
  if (!name) return { ok: false, error: "이름을 입력해 주세요." };
  if (!role) return { ok: false, error: "직무를 선택해 주세요." };

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "회의를 찾지 못했어요." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의라 응답할 수 없어요." };
  }

  const participants = await fetchParticipants(args.meetingId);
  const participant = participants.find(
    (p) => normalizeIdentity(p.name) === name && normalizeIdentity(p.role) === role,
  );

  if (!participant) {
    return { ok: false, error: "입력한 이름과 직무가 참석자 명단과 달라요. 다시 확인해 주세요." };
  }

  const hasValidToken =
    args.token != null &&
    args.token.length > 0 &&
    args.token === participant.participantToken;

  if (participant.responseStatus === "submitted" && !hasValidToken) {
    return {
      ok: false,
      error: "이미 응답한 참석자예요. 처음 응답했던 브라우저에서만 수정할 수 있어요.",
    };
  }

  return {
    ok: true,
    participantId: participant.id,
    name: participant.name,
    role: participant.role,
    responseStatus: participant.responseStatus,
    token: participant.participantToken,
  };
}

// ---- 응답 제출/수정 ----

export async function submitAvailability(args: SubmitAvailabilityArgs): Promise<SubmitResult> {
  if ((args.memo ?? "").length > MAX_MEMO_LENGTH) {
    return { ok: false, error: "메모가 너무 길어요." };
  }
  if ((args.role ?? "").length > MAX_ROLE_LENGTH) {
    return { ok: false, error: "역할이 너무 길어요." };
  }

  if (isDemoMeetingId(args.meetingId)) {
    const meeting = await fetchMeeting(args.meetingId);
    const participant = await assertParticipantToken(
      args.meetingId,
      args.participantId,
      args.token ?? "",
    );
    if (!meeting || !participant) return { ok: false, error: "참석자를 찾지 못했어요." };

    const blockCheck = validateSubmittedBlocks(toSchedulerMeeting(meeting), args.blocks);
    if (!blockCheck.ok) return { ok: false, error: blockCheck.reason };

    return { ok: true, participantId: participant.id, token: participant.participant_token };
  }

  const sb = getSupabaseAdmin();

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "회의를 찾지 못했어요." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의는 응답을 수정할 수 없어요." };
  }

  const { data: pData, error: pErr } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (pErr || !pData) return { ok: false, error: "참석자를 찾지 못했어요." };

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
  const role = args.role?.trim() ?? participant.role;
  const { error: updErr } = await sb
    .from("participants")
    .update({ response_status: "submitted", role, memo, updated_at: new Date().toISOString() })
    .eq("id", args.participantId);
  if (updErr) return { ok: false, error: "응답을 저장하지 못했어요." };

  // 투표는 없다 — 모든 참석자가 응답을 마쳤고 확정 조건을 만족하면 modu 가 자동 확정한다.
  const confirmResult = await autoConfirmMeetingIfReady(args.meetingId);
  if (!confirmResult.ok) return { ok: false, error: confirmResult.error };
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
      ? { ok: true, blocks: [], memo: null }
      : { ok: false, error: "권한이 없어요." };
  }

  const sb = getSupabaseAdmin();
  const { data: pData } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (!pData) return { ok: false, error: "참석자를 찾지 못했어요." };

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
  if (!meeting) return { ok: false, error: "회의를 찾지 못했어요." };

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
    );
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

// ---- 자동 확정 ----
// 투표는 없다. 모든 참석자가 응답을 마치면 modu 가 전체 응답을 해석해(evaluateAllSlots →
// buildContextualScheduleResult), 확정 조건(필수참석자 불가 0명 + 미응답 0명)을 만족하는
// 최상위 후보를 회의 시간으로 확정한다. 조건을 만족하는 후보가 없으면 확정하지 않고
// 화면이 기간 조정 안내를 담당한다(noGoodOption 문구).

async function autoConfirmMeetingIfReady(meetingId: string): Promise<SimpleResult> {
  // 데모 회의는 저장소가 없어 확정하지 않는다.
  if (isDemoMeetingId(meetingId)) return { ok: true };

  const [meeting, participants, blocks] = await Promise.all([
    fetchMeeting(meetingId),
    fetchParticipants(meetingId),
    fetchBlocks(meetingId),
  ]);
  if (!meeting) return { ok: false, error: "회의를 찾지 못했어요." };
  if (meeting.confirmedSlotId) return { ok: true };
  if (participants.length === 0) return { ok: true };
  // 미응답자가 있으면 확정하지 않는다(화면은 잠정 결과만 보여준다).
  if (participants.some((p) => p.responseStatus !== "submitted")) return { ok: true };

  const input = toSchedulerInput(meeting, participants, blocks);
  const contextual = buildContextualScheduleResult(evaluateAllSlots(input));
  const candidate = pickAutoConfirmSlot(contextual);
  if (!candidate) return { ok: true };

  // 확정 직전 서버 검증(회의 길이·날짜 범위·근무시간·점심 등)을 한 번 더 통과해야 한다.
  const confirmable = isSlotConfirmable(
    input.meeting,
    input.participants,
    input.blocks,
    candidate.startAt,
    candidate.endAt,
  );
  if (!confirmable.ok) return { ok: false, error: confirmable.reason };

  const summaryText = buildShareText({
    title: meeting.title,
    agenda: meeting.agenda,
    location: meeting.location,
    startAt: candidate.startAt,
    endAt: candidate.endAt,
    // 확정 조건이 '필수 전원 가능 + 미응답 없음'이므로 항상 참이다.
    requiredAllAvailable: true,
  });

  const sb = getSupabaseAdmin();
  // 경합 방지: 동시에 두 응답이 제출될 수 있어 확정 직전 최신 상태를 다시 확인한다.
  const latestMeeting = await fetchMeeting(meetingId);
  if (!latestMeeting) return { ok: false, error: "회의를 찾지 못했어요." };
  if (latestMeeting.confirmedSlotId) return { ok: true };

  const { data: slot, error } = await sb
    .from("confirmed_slots")
    .insert({
      meeting_id: meetingId,
      start_at: candidate.startAt,
      end_at: candidate.endAt,
      summary_text: summaryText,
    })
    .select("id")
    .single();
  if (error || !slot) return { ok: false, error: "회의 시간을 확정하지 못했어요." };

  const { error: updateError } = await sb
    .from("meetings")
    .update({ confirmed_slot_id: slot.id })
    .eq("id", meetingId);
  if (updateError) return { ok: false, error: "회의 시간을 확정하지 못했어요." };

  revalidatePath(`/m/${meetingId}`);
  revalidatePath(`/meetings/${meetingId}/confirmed`);
  return { ok: true };
}
