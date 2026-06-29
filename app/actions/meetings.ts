"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  fetchBlocks,
  fetchBlocksForParticipant,
  fetchMeeting,
  fetchParticipants,
  fetchVotes,
  isRequiredAllAvailable,
  toSchedulerInput,
  toSchedulerMeeting,
} from "@/lib/data";
import {
  isSlotConfirmable,
  MAX_MEMO_LENGTH,
  validateSubmittedBlocks,
  recommendSlots,
} from "@/lib/scheduler";
import { buildShareText } from "@/lib/share";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { generateToken } from "@/lib/tokens";
import { parseHm, todayDateStrKst } from "@/lib/time";
import { mapMeeting, type MeetingRow, type ParticipantRow } from "@/lib/types";
import {
  MAX_MEETING_AGENDA_LENGTH,
  MAX_MEETING_LOCATION_LENGTH,
  MAX_MEETING_PARTICIPANTS,
  MAX_MEETING_TITLE_LENGTH,
  MIN_MEETING_PARTICIPANTS,
} from "@/lib/meetingLimits";
import type {
  ConfirmSlotArgs,
  FormState,
  LoadCalendarSnapshotArgs,
  LoadCalendarSnapshotResult,
  LoadResponseArgs,
  LoadResponseResult,
  LoadVotingOptionsArgs,
  LoadVotingOptionsResult,
  SimpleResult,
  SubmitAvailabilityArgs,
  SubmitVoteArgs,
  SubmitResult,
  UpdateAttendanceArgs,
  VerifyParticipantIdentityArgs,
  VerifyParticipantIdentityResult,
  VoteOption,
} from "@/lib/actionTypes";

const MAX_ROLE_LENGTH = 40;
const DEFAULT_WORKDAY_START = "09:00";
const DEFAULT_WORKDAY_END = "18:00";
const DISABLED_LUNCH_START = "00:00";
const DISABLED_LUNCH_END = "00:01";
const MEETING_STORAGE_ERROR_MESSAGE =
  "회의 링크를 만들기 위한 서버 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.";

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
  const editMeetingId = String(formData.get("meetingId") ?? "").trim();
  const editAdminToken = String(formData.get("adminToken") ?? "").trim();
  const isEditing = editMeetingId.length > 0 || editAdminToken.length > 0;
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
    return { error: `회의명은 최대 ${MAX_MEETING_TITLE_LENGTH}글자까지 입력할 수 있습니다.` };
  }
  if (!agenda) return { error: "회의 안건을 입력해 주세요." };
  if (rawAgenda.length > MAX_MEETING_AGENDA_LENGTH) {
    return { error: `회의 안건은 최대 ${MAX_MEETING_AGENDA_LENGTH}글자까지 입력할 수 있습니다.` };
  }
  if (!location) return { error: "회의 장소를 입력해 주세요." };
  if (rawLocation.length > MAX_MEETING_LOCATION_LENGTH) {
    return { error: `회의 장소는 최대 ${MAX_MEETING_LOCATION_LENGTH}글자까지 입력할 수 있습니다.` };
  }
  if (isEditing && (!editMeetingId || !editAdminToken)) {
    return { error: "수정 권한 정보가 올바르지 않습니다." };
  }
  if (participants.length < MIN_MEETING_PARTICIPANTS) {
    return { error: `참석자는 최소 ${MIN_MEETING_PARTICIPANTS}명 이상이어야 합니다.` };
  }
  if (participants.length > MAX_MEETING_PARTICIPANTS) {
    return { error: `참석자는 최대 ${MAX_MEETING_PARTICIPANTS}명까지 선택할 수 있습니다.` };
  }
  if (!deadlineDate) {
    return { error: "회의 마감 날짜를 선택해 주세요." };
  }
  if (deadlineDate < dateStart) {
    return { error: "회의 마감 날짜는 오늘 이후로 선택해 주세요." };
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
    return { error: "회의 길이는 1분 이상이어야 합니다." };
  }
  const ws = parseHm(workdayStart);
  const we = parseHm(workdayEnd);
  if (!(ws < we)) return { error: "근무 시작 시간은 종료 시간보다 빨라야 합니다." };
  if (durationMinutes > we - ws) return { error: "회의 길이가 근무 시간보다 깁니다." };

  const storage = getMeetingStorage();
  if (!storage.ok) return { error: storage.error };
  const { sb } = storage;

  if (isEditing) {
    let meeting;
    try {
      meeting = await fetchMeeting(editMeetingId);
    } catch (error) {
      logMeetingStorageError("failed to load meeting for edit", error);
      return { error: MEETING_STORAGE_ERROR_MESSAGE };
    }
    if (!meeting || meeting.adminToken !== editAdminToken) {
      return { error: "수정 권한이 없습니다." };
    }
    if (meeting.confirmedSlotId) {
      return { error: "이미 확정된 회의는 수정할 수 없습니다." };
    }

    let existingParticipants;
    try {
      existingParticipants = await fetchParticipants(editMeetingId);
    } catch (error) {
      logMeetingStorageError("failed to load participants for edit", error);
      return { error: MEETING_STORAGE_ERROR_MESSAGE };
    }
    if (existingParticipants.some((participant) => participant.responseStatus === "submitted")) {
      return { error: "이미 응답이 있는 회의는 생성 화면에서 수정할 수 없어요." };
    }

    const { error: meetingError } = await sb
      .from("meetings")
      .update({
        title,
        agenda,
        location,
        duration_minutes: durationMinutes,
        date_start: meeting.dateStart,
        date_end: dateEnd,
        workday_start: workdayStart,
        workday_end: workdayEnd,
        lunch_start: lunchStart,
        lunch_end: lunchEnd,
      })
      .eq("id", editMeetingId)
      .eq("admin_token", editAdminToken);

    if (meetingError) {
      logMeetingStorageError("failed to update meeting", meetingError);
      return { error: "회의 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }

    const { error: deleteParticipantError } = await sb
      .from("participants")
      .delete()
      .eq("meeting_id", editMeetingId);
    if (deleteParticipantError) {
      logMeetingStorageError("failed to replace participants", deleteParticipantError);
      return { error: "참석자 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }

    const participantRows = participants.map((p) => ({
      meeting_id: editMeetingId,
      name: p.name,
      role: p.role,
      attendance_type: p.attendanceType,
      participant_token: generateToken(),
    }));

    const { error: participantError } = await sb.from("participants").insert(participantRows);
    if (participantError) {
      logMeetingStorageError("failed to insert edited participants", participantError);
      return { error: "참석자 수정에 실패했습니다. 잠시 후 다시 시도해 주세요." };
    }

    revalidatePath(`/meetings/${editMeetingId}/share`);
    revalidatePath(`/meetings/${editMeetingId}/share/${editAdminToken}`);
    revalidatePath(`/m/${editMeetingId}`);
    redirect(`/meetings/${editMeetingId}/share/${editAdminToken}`);
  }

  const adminToken = generateToken();

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
      admin_token: adminToken,
    })
    .select("id")
    .single();

  if (meetingError || !meetingData) {
    logMeetingStorageError("failed to create meeting", meetingError);
    return { error: "회의 생성에 실패했습니다. 잠시 후 다시 시도해 주세요." };
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
    return { error: "참석자 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
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
  if (!meeting) return { ok: false, error: "회의를 찾을 수 없습니다." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의는 응답할 수 없습니다." };
  }

  const participants = await fetchParticipants(args.meetingId);
  const participant = participants.find(
    (p) => normalizeIdentity(p.name) === name && normalizeIdentity(p.role) === role,
  );

  if (!participant) {
    return { ok: false, error: "입력한 이름과 직무가 참석자 명단과 일치하지 않습니다." };
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
  const sb = getSupabaseAdmin();

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "회의를 찾을 수 없습니다." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의는 응답을 수정할 수 없어요." };
  }

  const { data: pData, error: pErr } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (pErr || !pData) return { ok: false, error: "참석자를 찾을 수 없습니다." };

  const participant = pData as ParticipantRow;
  if (participant.meeting_id !== args.meetingId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  // 이미 제출한 응답은 같은 브라우저(토큰 일치)에서만 수정할 수 있다.
  if (participant.response_status === "submitted") {
    if (!args.token || args.token !== participant.participant_token) {
      return {
        ok: false,
        error: "이 응답을 수정할 권한이 없습니다. 처음 제출한 브라우저에서만 수정할 수 있어요.",
      };
    }
  }

  // 메모 길이 제한.
  if ((args.memo ?? "").length > MAX_MEMO_LENGTH) {
    return { ok: false, error: "메모가 너무 깁니다." };
  }
  if ((args.role ?? "").length > MAX_ROLE_LENGTH) {
    return { ok: false, error: "역할이 너무 깁니다." };
  }

  // 제출 블록 서버 검증(클라이언트 우회 방어): 날짜 범위·근무 시간·점심·30분·개수.
  const blockCheck = validateSubmittedBlocks(toSchedulerMeeting(meeting), args.blocks);
  if (!blockCheck.ok) return { ok: false, error: blockCheck.reason };

  // 기존 응답을 교체한다.
  const { error: delErr } = await sb
    .from("availability_blocks")
    .delete()
    .eq("participant_id", args.participantId);
  if (delErr) return { ok: false, error: "응답 저장에 실패했습니다." };

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
    if (insErr) return { ok: false, error: "응답 저장에 실패했습니다." };
  }

  // 메모는 블록 유무와 무관하게 참석자 레코드에 저장한다(빈 시간표여도 메모 보존).
  const memo = args.memo?.trim() || null;
  const role = args.role?.trim() ?? participant.role;
  const { error: updErr } = await sb
    .from("participants")
    .update({ response_status: "submitted", role, memo, updated_at: new Date().toISOString() })
    .eq("id", args.participantId);
  if (updErr) return { ok: false, error: "응답 저장에 실패했습니다." };

  // 응답이 바뀌면 추천 후보가 달라질 수 있으므로 해당 회의의 기존 후보 투표를 초기화한다.
  const { error: voteDeleteErr } = await sb
    .from("meeting_votes")
    .delete()
    .eq("meeting_id", args.meetingId);
  if (voteDeleteErr) return { ok: false, error: "후보 투표 초기화에 실패했습니다." };
  revalidatePath(`/m/${args.meetingId}`);

  return { ok: true, participantId: args.participantId, token: participant.participant_token };
}

// ---- 본인 응답 불러오기(수정용) ----

export async function loadParticipantResponse(
  args: LoadResponseArgs,
): Promise<LoadResponseResult> {
  const sb = getSupabaseAdmin();
  const { data: pData } = await sb
    .from("participants")
    .select("*")
    .eq("id", args.participantId)
    .maybeSingle();
  if (!pData) return { ok: false, error: "참석자를 찾을 수 없습니다." };

  const participant = pData as ParticipantRow;
  if (participant.meeting_id !== args.meetingId || participant.participant_token !== args.token) {
    return { ok: false, error: "권한이 없습니다." };
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
  if (!participant) return { ok: false, error: "권한이 없습니다." };

  const [meeting, participants, blocks] = await Promise.all([
    fetchMeeting(args.meetingId),
    fetchParticipants(args.meetingId),
    fetchBlocks(args.meetingId),
  ]);
  if (!meeting) return { ok: false, error: "회의를 찾을 수 없습니다." };

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

function voteKey(startAt: string, endAt: string) {
  return `${startAt}|${endAt}`;
}

async function assertParticipantToken(
  meetingId: string,
  participantId: string,
  token: string,
): Promise<ParticipantRow | null> {
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

async function getVoteOptions(
  meetingId: string,
  participantId: string,
): Promise<VoteOption[]> {
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) return [];
  const participants = await fetchParticipants(meetingId);
  const blocks = await fetchBlocks(meetingId);
  const votes = await fetchVotes(meetingId);
  const recommendations = recommendSlots(toSchedulerInput(meeting, participants, blocks));
  const counts = new Map<string, number>();
  for (const v of votes) {
    const key = voteKey(v.startAt, v.endAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const ownVote = votes.find((v) => v.participantId === participantId);
  const ownKey = ownVote ? voteKey(ownVote.startAt, ownVote.endAt) : null;

  return recommendations.map((c) => {
    const key = voteKey(c.startAt, c.endAt);
    return {
      startAt: c.startAt,
      endAt: c.endAt,
      grade: c.grade,
      reason: c.reason,
      voteCount: counts.get(key) ?? 0,
      userSelected: ownKey === key,
    };
  });
}

async function assertVotingOpen(meetingId: string) {
  const participants = await fetchParticipants(meetingId);
  if (participants.length === 0 || participants.some((p) => p.responseStatus !== "submitted")) {
    return {
      ok: false as const,
      error: "아직 모든 참석자가 응답하지 않았어요. 모두 제출하면 후보 시간대에 투표할 수 있어요.",
    };
  }
  return { ok: true as const, participants };
}

// 자동 확정은 제거했다 — 확정은 주최자(admin)만 수행한다. (권한 원칙 일관)

export async function loadVotingOptions(
  args: LoadVotingOptionsArgs,
): Promise<LoadVotingOptionsResult> {
  const participant = await assertParticipantToken(
    args.meetingId,
    args.participantId,
    args.token,
  );
  if (!participant) return { ok: false, error: "권한이 없습니다." };
  if (participant.response_status !== "submitted") {
    return { ok: false, error: "가능한 시간을 먼저 제출해 주세요." };
  }
  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "회의를 찾을 수 없습니다." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의예요. 후보 투표를 볼 수 없습니다." };
  }
  const votingOpen = await assertVotingOpen(args.meetingId);
  if (!votingOpen.ok) return { ok: false, error: votingOpen.error };
  return { ok: true, options: await getVoteOptions(args.meetingId, args.participantId) };
}

export async function submitVote(args: SubmitVoteArgs): Promise<SimpleResult> {
  const participant = await assertParticipantToken(
    args.meetingId,
    args.participantId,
    args.token,
  );
  if (!participant) return { ok: false, error: "권한이 없습니다." };
  if (participant.response_status !== "submitted") {
    return { ok: false, error: "가능한 시간을 먼저 제출해 주세요." };
  }
  const votingOpen = await assertVotingOpen(args.meetingId);
  if (!votingOpen.ok) return { ok: false, error: votingOpen.error };

  const meeting = await fetchMeeting(args.meetingId);
  if (!meeting) return { ok: false, error: "회의를 찾을 수 없습니다." };
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의예요. 투표를 변경할 수 없어요." };
  }
  const participants = votingOpen.participants;
  const blocks = await fetchBlocks(args.meetingId);
  const recommendations = recommendSlots(toSchedulerInput(meeting, participants, blocks));
  const selected = recommendations.some(
    (c) => c.startAt === args.startAt && c.endAt === args.endAt,
  );
  if (!selected) {
    return { ok: false, error: "현재 후보 시간대 중 하나만 투표할 수 있습니다." };
  }

  const sb = getSupabaseAdmin();
  const { error: delErr } = await sb
    .from("meeting_votes")
    .delete()
    .eq("meeting_id", args.meetingId)
    .eq("participant_id", args.participantId);
  if (delErr) return { ok: false, error: "투표 저장에 실패했습니다." };

  const { error } = await sb.from("meeting_votes").insert({
    meeting_id: args.meetingId,
    participant_id: args.participantId,
    start_at: args.startAt,
    end_at: args.endAt,
  });
  if (error) return { ok: false, error: "투표 저장에 실패했습니다." };

  revalidatePath(`/m/${args.meetingId}`);
  return { ok: true };
}

// ---- 참석 유형 변경(admin) ----

export async function updateAttendanceType(args: UpdateAttendanceArgs): Promise<SimpleResult> {
  const sb = getSupabaseAdmin();
  const { data: meeting } = await sb
    .from("meetings")
    .select("id, admin_token, confirmed_slot_id")
    .eq("id", args.meetingId)
    .maybeSingle();
  if (!meeting || meeting.admin_token !== args.adminToken) {
    return { ok: false, error: "권한이 없습니다." };
  }
  if (meeting.confirmed_slot_id) {
    return { ok: false, error: "이미 확정된 회의는 참석 유형을 변경할 수 없습니다." };
  }

  const { error } = await sb
    .from("participants")
    .update({ attendance_type: args.attendanceType, updated_at: new Date().toISOString() })
    .eq("id", args.participantId)
    .eq("meeting_id", args.meetingId);
  if (error) return { ok: false, error: "변경에 실패했습니다." };

  const { error: voteDeleteErr } = await sb
    .from("meeting_votes")
    .delete()
    .eq("meeting_id", args.meetingId);
  if (voteDeleteErr) return { ok: false, error: "후보 투표 초기화에 실패했습니다." };

  // 변경 후 추천 결과가 다시 계산되도록 admin 화면을 무효화한다.
  revalidatePath(`/admin/${args.meetingId}/${args.adminToken}`);
  revalidatePath(`/m/${args.meetingId}`);
  return { ok: true };
}

// ---- 회의 확정(admin) ----

export async function confirmSlot(args: ConfirmSlotArgs): Promise<SimpleResult | void> {
  const sb = getSupabaseAdmin();
  const { data: mRow } = await sb
    .from("meetings")
    .select("*")
    .eq("id", args.meetingId)
    .maybeSingle();
  if (!mRow || (mRow as MeetingRow).admin_token !== args.adminToken) {
    return { ok: false, error: "권한이 없습니다." };
  }

  const meeting = mapMeeting(mRow as MeetingRow);
  if (meeting.confirmedSlotId) {
    return { ok: false, error: "이미 확정된 회의입니다." };
  }
  const participants = await fetchParticipants(args.meetingId);
  const blocks = await fetchBlocks(args.meetingId);
  const votes = await fetchVotes(args.meetingId);

  if (participants.length === 0 || participants.some((p) => p.responseStatus !== "submitted")) {
    return { ok: false, error: "모든 참석자가 응답한 뒤에 다수결 확정을 할 수 있습니다." };
  }
  const voterIds = new Set(votes.map((v) => v.participantId));
  if (!participants.every((p) => voterIds.has(p.id))) {
    return { ok: false, error: "모든 참석자의 후보 투표가 모인 뒤에 확정할 수 있습니다." };
  }
  if (votes.length === 0) {
    return { ok: false, error: "아직 투표가 없습니다. 후보 시간대 투표 후 확정해 주세요." };
  }
  const voteCounts = new Map<string, number>();
  for (const v of votes) {
    const key = voteKey(v.startAt, v.endAt);
    voteCounts.set(key, (voteCounts.get(key) ?? 0) + 1);
  }
  const selectedVoteCount = voteCounts.get(voteKey(args.startAt, args.endAt)) ?? 0;
  const maxVoteCount = Math.max(...voteCounts.values());
  if (selectedVoteCount === 0) {
    return { ok: false, error: "투표가 없는 후보는 확정할 수 없습니다." };
  }
  if (selectedVoteCount < maxVoteCount) {
    return { ok: false, error: "최다 득표 후보만 확정할 수 있습니다." };
  }
  // selectedVoteCount === maxVoteCount: 단독 1위거나 공동 1위 → 주최자가 고른 후보를 확정한다(타이브레이크).

  // (#1) 확정하려는 슬롯이 실제로 유효한지 서버에서 검증한다.
  // 근무 시간·점심·회의 길이·30분 정렬·날짜 범위·필수 참석자 busy 충돌을 모두 확인한다.
  const schedulerInput = toSchedulerInput(meeting, participants, blocks);
  const confirmable = isSlotConfirmable(
    schedulerInput.meeting,
    schedulerInput.participants,
    schedulerInput.blocks,
    args.startAt,
    args.endAt,
  );
  if (!confirmable.ok) return { ok: false, error: confirmable.reason };

  // 선택한 정확한 슬롯에 대해 필수 충족 여부를 계산한다(공유 문구용).
  const requiredAllAvailable = isRequiredAllAvailable(
    participants,
    blocks,
    args.startAt,
    args.endAt,
  );

  const summaryText = buildShareText({
    title: meeting.title,
    agenda: meeting.agenda,
    location: meeting.location,
    startAt: args.startAt,
    endAt: args.endAt,
    requiredAllAvailable,
  });

  const existingSlotId = (mRow as MeetingRow).confirmed_slot_id;
  if (existingSlotId) {
    // 재확정: 기존 confirmed_slots 행을 갱신해 고아 레코드를 남기지 않는다.
    const { error } = await sb
      .from("confirmed_slots")
      .update({
        start_at: args.startAt,
        end_at: args.endAt,
        summary_text: summaryText,
      })
      .eq("id", existingSlotId);
    if (error) return { ok: false, error: "확정에 실패했습니다." };
  } else {
    const { data: slot, error } = await sb
      .from("confirmed_slots")
      .insert({
        meeting_id: args.meetingId,
        start_at: args.startAt,
        end_at: args.endAt,
        summary_text: summaryText,
      })
      .select("id")
      .single();
    if (error || !slot) return { ok: false, error: "확정에 실패했습니다." };

    const { error: updErr } = await sb
      .from("meetings")
      .update({ confirmed_slot_id: slot.id })
      .eq("id", args.meetingId);
    if (updErr) return { ok: false, error: "확정에 실패했습니다." };
  }

  revalidatePath(`/admin/${args.meetingId}/${args.adminToken}`);
  redirect(`/meetings/${args.meetingId}/confirmed`);
}
