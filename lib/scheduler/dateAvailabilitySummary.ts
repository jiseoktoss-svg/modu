// 날짜 전체 요약 — 캘린더에서 날짜를 눌렀을 때 "이 날은 특정 시간만 가능한가?"라는
// 오해를 막기 위해, 그 날짜의 모든 후보 시간을 평가해 하루 단위 상태로 요약한다.
// 후보 시간 생성은 generateSlots 를 재사용해 근무시간·회의 길이·점심 제외 규칙이
// 추천 엔진과 어긋나지 않게 한다. 조회 전용 — 확정/투표 기능이 아니다.

import { formatKoreanTimeRange, isoToEpoch, kstWallToIso, parseHm } from "@/lib/time";
import { generateSlots } from "./generateSlots";
import {
  lookupAvailabilityAtTime,
  type AvailabilityLookupBlock,
  type AvailabilityLookupParticipant,
  type AvailabilityLookupResult,
} from "./availabilityLookup";

export type DateAvailabilityException = {
  startAt: string;
  endAt: string;
  names: string[];
  requiredNames: string[];
  optionalNames: string[];
  // pending 은 시간이 아니라 사람 단위 상태라 예외 구간으로 만들지 않고 문구로만 다룬다.
  // (타입은 향후 확장을 위해 남겨 둔다.)
  reason: "requiredBusy" | "optionalBusy" | "pending";
};

export type DateAvailabilitySummary = {
  date: string;

  totalSlots: number;

  allSlotsAllAvailable: boolean;
  allSlotsRequiredAvailable: boolean;

  allAvailableSlots: AvailabilityLookupResult[];
  requiredIssueSlots: AvailabilityLookupResult[];
  optionalIssueSlots: AvailabilityLookupResult[];
  pendingSlots: AvailabilityLookupResult[];

  headline: string;
  comment: string;

  exceptionRanges: DateAvailabilityException[];
};

/** "김지훈님" / "김지훈님과 이서연님" / 3명 이상은 쉼표 나열 (contextualResult 와 동일 규칙). */
function formatNameList(names: string[]): string {
  const honored = names.map((n) => `${n}님`);
  if (honored.length <= 1) return honored.join("");
  if (honored.length === 2) return `${honored[0]}과 ${honored[1]}`;
  return honored.join(", ");
}

/** 참석자의 '실제 busy 시각'을 그대로 예외 구간으로 만든다.
 *  후보 슬롯을 병합하면 회의 길이만큼 앞뒤로 넓어져 날짜·시간 검색과 어긋난다
 *  (예: 14:00~15:00 불가인데 2시간 회의면 12:30~16:30으로 보임) — 실제 불가 블록을
 *  근무시간으로 클램프한 뒤, 블록 경계로 타임라인을 나눠 '같은 사람들이 불가한 구간'끼리만
 *  묶어 실제 시각을 보여준다. 이러면 검색 결과와 항상 일치한다. */
function buildExceptionRanges(
  blocks: AvailabilityLookupBlock[],
  participants: AvailabilityLookupParticipant[],
  date: string,
  workdayStart: string,
  workdayEnd: string,
): DateAvailabilityException[] {
  const order = new Map(participants.map((p, i) => [p.id, i] as const));
  const workStartIso = kstWallToIso(date, parseHm(workdayStart));
  const workEndIso = kstWallToIso(date, parseHm(workdayEnd));
  const workStartE = isoToEpoch(workStartIso);
  const workEndE = isoToEpoch(workEndIso);

  // busy 블록만, 근무시간과 겹치는 부분으로 클램프한다. (avoid/preferred 는 참석 가능으로 본다)
  type Busy = {
    id: string;
    name: string;
    required: boolean;
    startE: number;
    endE: number;
    startIso: string;
    endIso: string;
  };
  const busy: Busy[] = [];
  for (const b of blocks) {
    if (b.status !== "busy") continue;
    const idx = order.get(b.participantId);
    if (idx === undefined) continue;
    const p = participants[idx];
    const rawStartE = isoToEpoch(b.startAt);
    const rawEndE = isoToEpoch(b.endAt);
    const startE = Math.max(rawStartE, workStartE);
    const endE = Math.min(rawEndE, workEndE);
    if (startE >= endE) continue; // 근무시간과 안 겹침
    busy.push({
      id: p.id,
      name: p.name,
      required: p.attendanceType === "required",
      startE,
      endE,
      startIso: startE === rawStartE ? b.startAt : workStartIso,
      endIso: endE === rawEndE ? b.endAt : workEndIso,
    });
  }
  if (busy.length === 0) return [];

  // 모든 블록 경계(에폭→iso)로 타임라인을 나눈다.
  const boundIso = new Map<number, string>();
  for (const x of busy) {
    boundIso.set(x.startE, x.startIso);
    boundIso.set(x.endE, x.endIso);
  }
  const bounds = [...boundIso.keys()].sort((a, b) => a - b);

  type Seg = { startE: number; endE: number; ids: string[]; key: string };
  const segments: Seg[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const startE = bounds[i];
    const endE = bounds[i + 1];
    const ids = busy
      .filter((x) => x.startE <= startE && endE <= x.endE)
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((x) => x.id);
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) continue; // 아무도 불가하지 않은 빈 구간
    segments.push({ startE, endE, ids: uniqueIds, key: uniqueIds.join("|") });
  }

  // 같은 사람 집합이 연속되면 한 구간으로 병합한다.
  const merged: Seg[] = [];
  for (const seg of segments) {
    const last = merged.at(-1);
    if (last && last.key === seg.key && last.endE === seg.startE) {
      last.endE = seg.endE;
    } else {
      merged.push({ ...seg });
    }
  }

  const byId = new Map(busy.map((x) => [x.id, x] as const));
  return merged
    .map((m) => {
      const people = m.ids.map((id) => byId.get(id)!);
      const requiredNames = people.filter((x) => x.required).map((x) => x.name);
      const optionalNames = people.filter((x) => !x.required).map((x) => x.name);
      return {
        startAt: boundIso.get(m.startE)!,
        endAt: boundIso.get(m.endE)!,
        names: people.map((x) => x.name),
        requiredNames,
        optionalNames,
        reason: (requiredNames.length > 0
          ? "requiredBusy"
          : "optionalBusy") as DateAvailabilityException["reason"],
      };
    })
    // 필수 불가 구간을 먼저(심각한 순), 그 안에서는 이른 시간 순.
    .sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === "requiredBusy" ? -1 : 1;
      return isoToEpoch(a.startAt) - isoToEpoch(b.startAt);
    });
}

export function buildDateAvailabilitySummary(
  date: string,
  results: AvailabilityLookupResult[],
  exceptionRanges: DateAvailabilityException[],
): DateAvailabilitySummary {
  const totalSlots = results.length;
  const allSlotsAllAvailable =
    totalSlots > 0 &&
    results.every((r) => !r.hasPending && r.totalAvailable === r.totalParticipants);
  const allSlotsRequiredAvailable =
    totalSlots > 0 &&
    results.every(
      (r) => r.requiredBusyNames.length === 0 && r.requiredPendingNames.length === 0,
    );

  const allAvailableSlots = results.filter(
    (r) => !r.hasPending && r.totalAvailable === r.totalParticipants,
  );
  const requiredIssueSlots = results.filter((r) => r.requiredBusyNames.length > 0);
  const optionalIssueSlots = results.filter(
    (r) => r.requiredBusyNames.length === 0 && r.optionalBusyNames.length > 0,
  );
  const pendingSlots = results.filter((r) => r.hasPending);

  // ---- 문구 ----
  let headline = "";
  let comment = "";

  if (totalSlots === 0) {
    headline = "이 날은 고를 수 있는 회의 시간이 없어요.";
    comment = "회의 기간과 근무 시간을 확인해 주세요.";
  } else {
    const pendingCount = results[0].totalPending;
    const noBusyAnywhere = results.every((r) => r.busyNames.length === 0);

    if (allSlotsAllAvailable) {
      // "하루 종일"(24시간처럼 읽힘)이나 "모든 시간" 대신 "회의 가능 시간대 전체"로 쓴다.
      headline = "이 날은 회의 가능 시간대 전체에 모든 인원이 참석할 수 있어요.";
      comment = "어느 시간을 골라도 괜찮아요.";
    } else if (noBusyAnywhere && pendingCount > 0) {
      headline = "이 날은 응답한 사람 기준으로 회의 가능 시간대 전체에 참석할 수 있어요.";
    } else if (requiredIssueSlots.length === totalSlots) {
      // 어느 시간을 골라도 필수참석자가 빠진다.
      headline = "이 날은 모든 인원이 맞는 시간이 없어요.";
      comment = "필수참석자가 모두 가능한 시간대를 먼저 확인하는 게 좋아요.";
    } else if (requiredIssueSlots.length > 0) {
      headline = "이 날은 일부 시간에 필수참석자가 참석하기 어려워요.";
      const worst = exceptionRanges.find((x) => x.reason === "requiredBusy");
      if (worst) {
        // 예외는 참석자의 실제 busy 시각이라 날짜·시간 검색 결과와 그대로 일치한다.
        comment = `${formatKoreanTimeRange(worst.startAt, worst.endAt)} 시간에는 ${formatNameList(
          worst.requiredNames,
        )}이 참석하기 어려우니 회의는 피하는 게 좋아요.`;
      }
    } else if (allAvailableSlots.length > 0) {
      headline = "이 날은 대부분 시간에 모든 인원이 참석할 수 있어요.";
      const first = exceptionRanges[0];
      if (first) {
        comment = `다만 ${formatKoreanTimeRange(first.startAt, first.endAt)} 시간에는 ${formatNameList(
          first.names,
        )}이 참석하기 어려워요.`;
      }
    } else {
      headline = "이 날은 모든 인원이 맞는 시간이 없어요.";
      comment = allSlotsRequiredAvailable
        ? "그래도 필수참석자는 모든 시간에 참석할 수 있어요. 일부 선택참석자가 참석하기 어려워요."
        : "필수참석자가 모두 가능한 시간대를 먼저 확인하는 게 좋아요.";
    }

    // 미응답은 잠정 결과 수식어로만 붙인다(contextualResult 와 동일 원칙).
    if (pendingCount > 0) {
      headline = `아직 ${pendingCount}명이 응답하지 않아 잠정 결과예요. ${headline}`;
    }
  }

  return {
    date,
    totalSlots,
    allSlotsAllAvailable,
    allSlotsRequiredAvailable,
    allAvailableSlots,
    requiredIssueSlots,
    optionalIssueSlots,
    pendingSlots,
    headline,
    comment,
    exceptionRanges,
  };
}

/** 하루의 모든 후보 시간(generateSlots 규칙)을 평가해 날짜 요약을 만든다. */
export function summarizeDateAvailability(args: {
  date: string;
  durationMinutes: number;
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  participants: AvailabilityLookupParticipant[];
  blocks: AvailabilityLookupBlock[];
}): DateAvailabilitySummary {
  const slots = generateSlots({
    durationMinutes: args.durationMinutes,
    dateStart: args.date,
    dateEnd: args.date,
    workdayStart: args.workdayStart,
    workdayEnd: args.workdayEnd,
    lunchStart: args.lunchStart,
    lunchEnd: args.lunchEnd,
  });

  const results = slots.map((slot) =>
    lookupAvailabilityAtTime({
      participants: args.participants,
      blocks: args.blocks,
      startAt: slot.startAt,
      endAt: slot.endAt,
    }),
  );

  const exceptionRanges = buildExceptionRanges(
    args.blocks,
    args.participants,
    args.date,
    args.workdayStart,
    args.workdayEnd,
  );

  return buildDateAvailabilitySummary(args.date, results, exceptionRanges);
}
