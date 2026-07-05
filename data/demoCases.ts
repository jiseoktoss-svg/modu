// 평가용 시나리오 데이터. docs/cases.md 의 대표 회의 조율 상황을 화면에서
// 빠르게 전환해 보기 위한 장치다(가짜 데이터가 아니라 설계 가설을 검증하는 시나리오).
// 평가자가 6명의 역할을 나눠 직접 재현하기에는 시간이 많이 들어, 시나리오를 고르면
// 그 상황에 맞는 후보/캘린더/날짜 요약을 바로 보여준다. 배경은 docs/case-study.md 참고.

import { addDaysToDateStr, kstWallToIso, todayDateStrKst } from "@/lib/time";
import type { RecommendationGrade } from "@/lib/scheduler";
import type { AttendanceType, AvailabilityStatus, ResponseStatus } from "@/lib/types";

const SLOT_DURATION_MIN = 60; // cases.md: 회의 길이 1시간

// 전제: 참석자 6명 = 필수 4명 + 선택 2명.
export const DEMO_PEOPLE: {
  id: string;
  name: string;
  role: string;
  attendanceType: AttendanceType;
}[] = [
  { id: "demo-p0", name: "김지훈", role: "기획", attendanceType: "required" },
  { id: "demo-p1", name: "이서연", role: "디자인", attendanceType: "required" },
  { id: "demo-p2", name: "박민준", role: "개발", attendanceType: "required" },
  { id: "demo-p3", name: "최수아", role: "마케팅", attendanceType: "required" },
  { id: "demo-p4", name: "정우진", role: "개발", attendanceType: "optional" },
  { id: "demo-p5", name: "한예린", role: "디자인", attendanceType: "optional" },
];

const REQUIRED_TOTAL = DEMO_PEOPLE.filter((p) => p.attendanceType === "required").length; // 4
const OPTIONAL_TOTAL = DEMO_PEOPLE.length - REQUIRED_TOTAL; // 2

type DemoSlot = {
  dateIndex: number;
  startMin: number; // 자정 이후 분 (KST)
  busy: number[]; // 이 시간에 회의가 어려운 사람 인덱스(DEMO_PEOPLE)
  // 등급/그룹은 buildCaseCandidates 가 우선순위 로직으로 도출한다(하드코딩 안 함).
};

export type DemoCase = {
  id: number;
  title: string;
  situation: string;
  judgment: string;
  banner?: { tone: "info" | "caution" | "danger"; text: string };
  submitted: number; // 응답 완료 인원 (총 6명 중)
  pendingNames: string[];
  slots: DemoSlot[];
  /** 후보 리스트와 별개로 스냅샷(날짜 요약·특정 시간 검색)에만 추가되는 busy 블록.
   *  외근처럼 하루 전체가 어려운 상황은 후보 슬롯 하나로 표현할 수 없어 여기에 둔다. */
  extraBusy?: { dateIndex: number; startMin: number; endMin: number; who: number[] }[];
  /** 매일 반복되는 불가 시간대(특정 시간만 늘 어려운 경우). 모든 날짜의 스냅샷 블록에 들어간다.
   *  후보(전원 가능 채움)에는 넣지 않아 날짜 톤은 '가능'으로 두고, 상단 경고에서 '매일 …'로 짚는다. */
  recurringBusy?: { startMin: number; endMin: number; who: number[] }[];
  /** 케이스 슬롯이 없는 나머지 미래 평일을 전원 가능 후보로 채울지 여부. 기본값은 true. */
  fillRemainingDates?: boolean;
  /** 자동으로 채우는 전원 가능 후보의 최대 개수. fillRemainingDates:false이면 무시된다. */
  maxFillerSlots?: number;
  /** 자동으로 채우는 전원 가능 후보의 시작 시각. 기본값은 10:00. */
  fillerStartMin?: number;
};

const H = (h: number) => h * 60;
const SPREAD_PATTERN_MIN_DATES = 10;
const SPREAD_PATTERN_EVERY_WEEKDAYS = 7;
const SPREAD_PATTERN_MAX_SLOTS = 12;

// 데모 캘린더가 샘플 데이터처럼 보이지 않도록, 피하면 좋은 날은 앞쪽에 몰지 않고
// 회의 기간 안에서 띄엄띄엄 배치한다. dateIndex 는 미래 평일 목록 기준이다.
export const DEMO_CASES: DemoCase[] = [
  {
    id: 1,
    title: "전원이 가능한 날짜가 여러 개 있음",
    situation: "모든 인원이 참석할 수 있는 날짜가 여러 개 있어요.",
    judgment:
      "억지로 순위를 나누지 않고 '모두 참석할 수 있는 날짜'로 묶어 먼저 보여줘요. 캘린더에서 날짜를 누르면 그 날 전체의 가능 상태를 보여줘요.",
    banner: {
      tone: "info",
      text: "비슷하게 좋은 날짜는 한 그룹으로 묶어 보여줘요. 더 이른 시간이 먼저예요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [
      // 전원 가능한 후보 여러 개(같은 그룹) + 선택 두 명이 어려운 아래 그룹 하나
      { dateIndex: 0, startMin: H(14), busy: [] },
      { dateIndex: 2, startMin: H(10), busy: [] },
      { dateIndex: 5, startMin: H(15), busy: [4, 5] },
    ],
  },
  {
    id: 2,
    title: "일부 선택참석자만 어려운 날이 있음",
    situation: "대부분 날짜는 전원이 참석할 수 있지만, 몇몇 날짜는 선택참석자 1~2명이 참석하기 어려워요.",
    judgment:
      "전원이 가능한 날이 충분히 많으면 일부 인원이 빠지는 날은 피하면 좋은 날로 표시해요. 필수참석자는 모두 가능하다는 점도 함께 보여줘요.",
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 4, startMin: H(10), busy: [5] },
      { dateIndex: 6, startMin: H(16), busy: [4, 5] },
    ],
  },
  {
    id: 3,
    title: "필수참석자 가능 vs 선택참석자 가능 충돌",
    situation:
      "필수참석자는 다 되지만 선택참석자가 빠지는 날과, 선택참석자는 다 되지만 필수참석자 1명이 어려운 날이 같이 있어요.",
    judgment:
      "선택참석자가 더 많이 가능해도 필수참석자가 참여 못하는 날짜는 후순위로 고려해요. 필수참석자가 모두 가능한 날짜가 우선시 됩니다.",
    submitted: 6,
    pendingNames: [],
    maxFillerSlots: 1,
    fillerStartMin: H(12),
    slots: [
      // 필수 전원 가능, 선택 둘 다 어려움 → 그래도 필수가 어려운 후보들보다 먼저
      { dateIndex: 1, startMin: H(14), busy: [4, 5] },
      // 선택 전원 가능, 필수 1명(김지훈) 어려움
      { dateIndex: 4, startMin: H(10), busy: [0] },
      // 필수 2명(이서연·박민준) 어려움 → 피하면 좋은 시간
      { dateIndex: 6, startMin: H(15), busy: [1, 2] },
    ],
  },
  {
    id: 4,
    title: "특정 시간대만 늘 어려움",
    situation:
      "김지훈님(필수참석자)이 매일 13:00~14:00에는 회의가 어려워요. 날짜 전체가 아니라 그 시간대만 피하면 돼요.",
    judgment:
      "날짜를 통째로 빼지 않아요. '그 시간만 피하면 어느 날짜든 된다'고 안내하고, 캘린더는 모든 날짜를 가능으로 두되 그 시간대만 경고로 짚어요.",
    banner: {
      tone: "info",
      text: "매일 같은 시간만 어려운 경우엔 날짜가 아니라 그 시간대만 피하면 돼요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [],
    recurringBusy: [{ startMin: H(13), endMin: H(14), who: [0] }],
  },
  {
    id: 5,
    title: "필수참석자 1명이 어려운 날짜들",
    situation: "몇몇 날짜는 어느 시간을 골라도 필수참석자 1명이 참석하기 어려워요.",
    judgment:
      "그런 날짜는 '필수 1명 어려움' 그룹으로 분리해 보여주고, 최상위 추천처럼 과장하지 않아요. 누가 어려운지 이름과 함께 설명해요.",
    banner: {
      tone: "caution",
      text: "필수참석자가 어려운 날짜는 피하면 좋은 날짜로 표시돼요.",
    },
    submitted: 6,
    pendingNames: [],
    fillRemainingDates: false,
    slots: [
      { dateIndex: 0, startMin: H(10), busy: [0] },
      { dateIndex: 3, startMin: H(14), busy: [1] },
      { dateIndex: 5, startMin: H(11), busy: [2, 5] },
    ],
  },
  {
    id: 6,
    title: "필수참석자 2명 이상이 어려움",
    situation: "날짜 대부분에서 필수참석자 2명 이상이 참석하기 어려워요.",
    judgment:
      "그런 날짜는 피하면 좋은 시간으로 강하게 표시하고, 회의 기간을 조금 넓히는 게 좋다고 안내해요.",
    banner: {
      tone: "danger",
      text: "빨간 날짜는 필수참석자 여러 명이 참석하기 어려워요. 기간을 조금 넓히는 게 좋아요.",
    },
    submitted: 6,
    pendingNames: [],
    fillRemainingDates: false,
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [0, 1] },
      { dateIndex: 4, startMin: H(10), busy: [2, 3] },
      { dateIndex: 6, startMin: H(15), busy: [0, 1, 4] },
    ],
  },
  {
    id: 7,
    title: "미응답자가 있어 잠정 결과만 보여줌",
    situation: "참석자 6명 중 2명이 아직 응답하지 않았어요. 그중 1명(최수아)은 필수참석자예요.",
    judgment:
      "확정하지 않고 잠정 결과로만 보여줘요. 미응답자는 가능 인원으로 세지 않고, '필수참석자가 모두 가능'이라고 과장하지 않아요.",
    banner: {
      tone: "caution",
      text: "아직 응답하지 않은 사람이 있어 잠정 결과만 보여줘요. 모두 응답하면 modu가 가장 나은 시간을 찾아드려요.",
    },
    submitted: 4,
    pendingNames: ["최수아", "한예린"],
    maxFillerSlots: 1,
    slots: [
      { dateIndex: 5, startMin: H(10), busy: [] },
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 4, startMin: H(15), busy: [1] },
    ],
  },
];

export type CaseCandidate = {
  date: string; // KST YYYY-MM-DD (캘린더 강조/그룹핑용)
  startAt: string;
  endAt: string;
  grade: RecommendationGrade;
  requiredAvail: number;
  requiredTotal: number;
  optionalAvail: number;
  optionalTotal: number;
  absentRequired: string[];
  // 이 시간 기준 참석자 명단 (필수+선택 합산, DEMO_PEOPLE 순서).
  availableNames: string[];
  busyNames: string[];
  pendingNames: string[];
  reason: string;
};

function isWeekendDateStr(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

// 데모 후보는 항상 '오늘 이후 평일'로 노출한다(주말은 회의 대상이 아님).
// 회의 기간(dates)에서 오늘까지의 날짜·주말을 제외하고, 남은 날이 없으면
// (기간이 이미 지난 링크) 내일 이후의 평일 4일로 대체한다.
function resolveDemoDates(dates: string[]): string[] {
  const today = todayDateStrKst();
  const future = dates.filter((d) => d > today && !isWeekendDateStr(d));
  if (future.length > 0) return future;
  const fallback: string[] = [];
  let cursor = today;
  while (fallback.length < 4) {
    cursor = addDaysToDateStr(cursor, 1);
    if (!isWeekendDateStr(cursor)) fallback.push(cursor);
  }
  return fallback;
}

function slotTimes(dates: string[], slot: DemoSlot) {
  const di = Math.max(0, Math.min(slot.dateIndex, dates.length - 1));
  const date = dates[di] ?? dates[0];
  return {
    startAt: kstWallToIso(date, slot.startMin),
    endAt: kstWallToIso(date, slot.startMin + SLOT_DURATION_MIN),
  };
}

function clampDateIndex(index: number, dateCount: number): number {
  return Math.max(0, Math.min(index, dateCount - 1));
}

function relativeDateIndex(index: number, dateCount: number): number {
  const normalized = Math.max(0, Math.min(index, 6)) / 6;
  return clampDateIndex(Math.round(normalized * (dateCount - 1)), dateCount);
}

function nearestFreeDateIndex(target: number, dateCount: number, used: Set<number>): number | null {
  const start = clampDateIndex(target, dateCount);
  for (let offset = 0; offset < dateCount; offset += 1) {
    const after = start + offset;
    if (after < dateCount && !used.has(after)) return after;
    const before = start - offset;
    if (before >= 0 && !used.has(before)) return before;
  }
  return null;
}

function spreadPatternIndexes(dateCount: number, count: number, seed: number, used: Set<number>) {
  const indexes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const base = ((i + 0.45) * dateCount) / count;
    const offset = ((seed + i * 2) % 5) - 2;
    const found = nearestFreeDateIndex(Math.round(base + offset), dateCount, used);
    if (found === null) break;
    used.add(found);
    indexes.push(found);
  }
  return indexes;
}

function buildCaseSlotsForDates(c: DemoCase, demoDates: string[]): DemoSlot[] {
  const dateCount = demoDates.length;
  if (dateCount <= SPREAD_PATTERN_MIN_DATES) return c.slots;

  const used = new Set<number>();
  const slots: DemoSlot[] = [];

  // 전원 가능 기준점은 기간 길이에 맞춰 상대 위치로 옮긴다.
  c.slots
    .filter((slot) => slot.busy.length === 0)
    .forEach((slot) => {
      const target = relativeDateIndex(slot.dateIndex, dateCount);
      const dateIndex = nearestFreeDateIndex(target, dateCount, used);
      if (dateIndex === null) return;
      used.add(dateIndex);
      slots.push({ ...slot, dateIndex });
    });

  const issueSlots = c.slots.filter((slot) => slot.busy.length > 0);
  if (issueSlots.length === 0) return slots;

  const spreadCount = Math.min(
    dateCount - used.size,
    SPREAD_PATTERN_MAX_SLOTS,
    Math.max(issueSlots.length, Math.ceil(dateCount / SPREAD_PATTERN_EVERY_WEEKDAYS)),
  );
  const indexes = spreadPatternIndexes(dateCount, spreadCount, c.id, used);
  indexes.forEach((dateIndex, i) => {
    const source = issueSlots[i % issueSlots.length];
    slots.push({ ...source, dateIndex });
  });

  return slots.sort((a, b) => {
    if (a.dateIndex !== b.dateIndex) return a.dateIndex - b.dateIndex;
    return a.startMin - b.startMin;
  });
}

export function buildCaseCandidates(c: DemoCase, dates: string[]): CaseCandidate[] {
  if (dates.length === 0) return [];
  const demoDates = resolveDemoDates(dates);
  const pending = new Set(c.pendingNames);
  const caseSlots = buildCaseSlotsForDates(c, demoDates);

  // 케이스 슬롯이 없는 나머지 미래 평일은 불가 입력이 없는 날 = '전원 가능' 후보로 그대로 올린다.
  const usedIdx = new Set(
    caseSlots.map((s) => Math.max(0, Math.min(s.dateIndex, demoDates.length - 1))),
  );
  const slots: DemoSlot[] = [...caseSlots];
  const fillRemainingDates = c.fillRemainingDates ?? true;
  const maxFillerSlots = c.maxFillerSlots ?? Number.POSITIVE_INFINITY;
  if (fillRemainingDates) {
    let fillerCount = 0;
    demoDates.forEach((_, di) => {
      if (!usedIdx.has(di) && fillerCount < maxFillerSlots) {
        slots.push({ dateIndex: di, startMin: c.fillerStartMin ?? H(10), busy: [] });
        fillerCount += 1;
      }
    });
  }

  // 각 슬롯을 순위 지표로 환산한다(busy=불가, pending=미응답).
  const enriched = slots.map((slot) => {
    const di = Math.max(0, Math.min(slot.dateIndex, demoDates.length - 1));
    const requiredBusyNames: string[] = [];
    const requiredPendingNames: string[] = [];
    const availableNames: string[] = [];
    const busyNames: string[] = [];
    const pendingNames: string[] = [];
    let optionalBusy = 0;
    let optionalPending = 0;
    DEMO_PEOPLE.forEach((p, idx) => {
      const isBusy = slot.busy.includes(idx);
      const isPending = pending.has(p.name);
      if (isBusy) busyNames.push(p.name);
      else if (isPending) pendingNames.push(p.name);
      else availableNames.push(p.name);
      if (p.attendanceType === "required") {
        if (isBusy) requiredBusyNames.push(p.name);
        else if (isPending) requiredPendingNames.push(p.name);
      } else if (isBusy) {
        optionalBusy += 1;
      } else if (isPending) {
        optionalPending += 1;
      }
    });
    return {
      slot,
      di,
      date: demoDates[di] ?? demoDates[0],
      availableNames,
      busyNames,
      pendingNames,
      ...slotTimes(demoDates, slot),
      requiredBusyNames,
      requiredPendingNames,
      optionalMissing: optionalBusy + optionalPending,
      requiredAvail: REQUIRED_TOTAL - requiredBusyNames.length - requiredPendingNames.length,
      optionalAvail: OPTIONAL_TOTAL - optionalBusy - optionalPending,
      requiredAllAvailable: requiredBusyNames.length === 0 && requiredPendingNames.length === 0,
      totalBusy: requiredBusyNames.length + optionalBusy,
    };
  });

  // 정렬: 1)전원(필수+선택) 가능 — 이 그룹 안에서는 날짜 빠른 순
  //       2)필수 더 많이 가능 3)선택 더 많이 가능 4)이른 날짜·시간
  enriched.sort((a, b) => {
    const aAll = a.requiredAllAvailable && a.optionalMissing === 0;
    const bAll = b.requiredAllAvailable && b.optionalMissing === 0;
    if (aAll !== bAll) return aAll ? -1 : 1;
    if (!aAll) {
      if (a.requiredAvail !== b.requiredAvail) return b.requiredAvail - a.requiredAvail;
      if (a.optionalAvail !== b.optionalAvail) return b.optionalAvail - a.optionalAvail;
    }
    if (a.di !== b.di) return a.di - b.di;
    return a.slot.startMin - b.slot.startMin;
  });

  // '가장 추천(best)'은 필수·선택 모두 가능한 1순위 1개에만.
  let bestAssigned = false;
  return enriched.map((e) => {
    let grade: RecommendationGrade;
    if (!e.requiredAllAvailable) {
      grade = "caution";
    } else if (e.optionalMissing === 0 && !bestAssigned) {
      grade = "best";
      bestAssigned = true;
    } else if (e.optionalMissing <= 1) {
      grade = "recommended";
    } else {
      grade = "conditional";
    }

    const reqParts: string[] = [];
    if (e.requiredBusyNames.length > 0) reqParts.push(`${e.requiredBusyNames.join(", ")} 빠짐`);
    if (e.requiredPendingNames.length > 0)
      reqParts.push(`${e.requiredPendingNames.join(", ")} 미응답`);
    const requiredText =
      reqParts.length === 0
        ? `필수인원 ${REQUIRED_TOTAL}명 모두 가능`
        : `필수인원 ${reqParts.join(", ")}`;
    const optionalText =
      e.optionalAvail === OPTIONAL_TOTAL
        ? `선택인원 ${OPTIONAL_TOTAL}명 모두 가능`
        : `선택인원 ${e.optionalAvail}/${OPTIONAL_TOTAL}명 가능`;

    return {
      date: e.date,
      startAt: e.startAt,
      endAt: e.endAt,
      grade,
      requiredAvail: e.requiredAvail,
      requiredTotal: REQUIRED_TOTAL,
      optionalAvail: e.optionalAvail,
      optionalTotal: OPTIONAL_TOTAL,
      absentRequired: e.requiredBusyNames,
      availableNames: e.availableNames,
      busyNames: e.busyNames,
      pendingNames: e.pendingNames,
      reason: `${requiredText} · ${optionalText}`,
    };
  });
}

export type CaseSnapshot = {
  participants: {
    id: string;
    name: string;
    role: string;
    attendanceType: AttendanceType;
    responseStatus: ResponseStatus;
  }[];
  blocks: { participantId: string; startAt: string; endAt: string; status: AvailabilityStatus }[];
};

export function buildCaseSnapshot(c: DemoCase, dates: string[]): CaseSnapshot {
  const blocks: CaseSnapshot["blocks"] = [];
  const seen = new Set<string>();
  if (dates.length > 0) {
    const demoDates = resolveDemoDates(dates);
    const caseSlots = buildCaseSlotsForDates(c, demoDates);
    for (const slot of caseSlots) {
      const { startAt, endAt } = slotTimes(demoDates, slot);
      for (const i of slot.busy) {
        const p = DEMO_PEOPLE[i];
        if (!p) continue;
        const key = `${p.id}|${startAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ participantId: p.id, startAt, endAt, status: "busy" });
      }
    }
    // 후보 슬롯으로 표현할 수 없는 추가 busy(외근 등 하루 전체) — 날짜 요약·검색용.
    for (const extra of c.extraBusy ?? []) {
      const di = Math.max(0, Math.min(extra.dateIndex, demoDates.length - 1));
      const date = demoDates[di] ?? demoDates[0];
      const startAt = kstWallToIso(date, extra.startMin);
      const endAt = kstWallToIso(date, extra.endMin);
      for (const i of extra.who) {
        const p = DEMO_PEOPLE[i];
        if (!p) continue;
        const key = `${p.id}|${startAt}|${endAt}`;
        if (seen.has(key)) continue;
        seen.add(key);
        blocks.push({ participantId: p.id, startAt, endAt, status: "busy" });
      }
    }
    // 매일 반복되는 불가(특정 시간대가 늘 어려운 경우) — 모든 날짜에 같은 블록을 넣는다.
    for (const rec of c.recurringBusy ?? []) {
      for (const date of demoDates) {
        const startAt = kstWallToIso(date, rec.startMin);
        const endAt = kstWallToIso(date, rec.endMin);
        for (const i of rec.who) {
          const p = DEMO_PEOPLE[i];
          if (!p) continue;
          const key = `${p.id}|${startAt}|${endAt}`;
          if (seen.has(key)) continue;
          seen.add(key);
          blocks.push({ participantId: p.id, startAt, endAt, status: "busy" });
        }
      }
    }
  }
  const pending = new Set(c.pendingNames);
  const participants = DEMO_PEOPLE.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    attendanceType: p.attendanceType,
    responseStatus: (pending.has(p.name) ? "pending" : "submitted") as ResponseStatus,
  }));
  return { participants, blocks };
}
