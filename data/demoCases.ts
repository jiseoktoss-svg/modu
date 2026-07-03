// 제품 흐름 데모용 케이스 데이터. docs/cases.md 의 8개 필수 케이스를 화면에 보여주기 위한 더미.
// 실제 입력과 무관하게, 케이스를 고르면 그 케이스에 맞는 후보 순위/캘린더를 보여준다.
// (현재 추천 엔진은 §8 차선후보/우선순위 규칙을 구현하지 않아, 의도한 결과를 손으로 정의한다.)

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
  busy: number[]; // 이 시간에 불가능한 사람 인덱스(DEMO_PEOPLE)
  // 등급/순위는 buildCaseCandidates 가 §8.5 로직으로 도출한다(하드코딩 안 함).
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
};

const H = (h: number) => h * 60;

export const DEMO_CASES: DemoCase[] = [
  {
    id: 1,
    title: "모두 되는 시간이 있음",
    situation: "필수인원 4명과 선택인원 2명이 전부 가능한 날이 있고, 일부 날짜만 한두 명이 빠져요.",
    judgment: "전원이 가능한 날을 1순위로 추천해요. 전원 가능한 날이 여러 개면 더 빠른 날짜가 위예요.",
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [] },
      { dateIndex: 2, startMin: H(10), busy: [4] },
      { dateIndex: 0, startMin: H(15), busy: [5] },
      { dateIndex: 3, startMin: H(11), busy: [4, 5] },
    ],
  },
  {
    id: 2,
    title: "선택인원만 일부 빠지는 날",
    situation: "며칠은 필수인원 4명이 다 되지만 선택인원이 1~2명 빠져요.",
    judgment: "필수인원이 다 되면 정상 후보로 유지해요. 다만 전원이 가능한 날이 있으면 그날이 먼저예요.",
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 2, startMin: H(10), busy: [5] },
      { dateIndex: 0, startMin: H(16), busy: [4, 5] },
    ],
  },
  {
    id: 3,
    title: "필수 우선 vs 선택 우선 충돌",
    situation:
      "필수인원은 다 되지만 선택인원이 빠지는 날과, 선택인원은 다 되지만 필수인원 1명이 빠지는 날이 같이 있어요.",
    judgment:
      "빠지는 사람이 있는 날끼리는 필수인원이 다 되는 날을 위에 둬요. 선택인원이 더 많이 돼도 필수인원이 빠지면 뒤로 밀려요.",
    submitted: 6,
    pendingNames: [],
    slots: [
      // 필수 전원 가능, 선택 둘 다 빠짐 → 그래도 필수 빠지는 후보들보다 위
      { dateIndex: 1, startMin: H(14), busy: [4, 5] },
      // 선택 전원 가능, 필수 1명(김지훈) 빠짐
      { dateIndex: 2, startMin: H(10), busy: [0] },
      // 필수 2명(이서연·박민준) 빠짐 → 더 아래
      { dateIndex: 0, startMin: H(15), busy: [1, 2] },
    ],
  },
  {
    id: 4,
    title: "필수인원이 빠지는 날들",
    situation: "며칠은 어느 시간을 골라도 필수인원 중 1명이 빠져요.",
    judgment: "그런 날은 차선 후보로 순위 아래쪽에 둬요. 필수인원이 가장 적게 빠지는 날이 차선 중 먼저예요.",
    banner: {
      tone: "caution",
      text: "필수인원이 빠지는 날은 차선 후보예요. 달력의 앰버색 날짜를 확인해 보세요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [3] },
      { dateIndex: 2, startMin: H(10), busy: [1] },
      { dateIndex: 0, startMin: H(15), busy: [2, 4] },
    ],
  },
  {
    id: 5,
    title: "차선 후보가 비슷비슷함",
    situation: "필수인원이 1명씩 빠지는 날이 여러 개라 우열을 가리기 애매해요.",
    judgment: "차선끼리는 선택인원이 더 많이 되는 날을 먼저, 그래도 같으면 더 이른 날을 먼저 보여줘요.",
    banner: {
      tone: "caution",
      text: "필수인원 1명씩 빠지는 차선 후보들은 선택인원 수와 빠른 날짜 순으로 정렬했어요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 0, startMin: H(10), busy: [0] },
      { dateIndex: 1, startMin: H(14), busy: [1] },
      { dateIndex: 2, startMin: H(11), busy: [2, 5] },
    ],
  },
  {
    id: 6,
    title: "필수인원이 2명 이상 빠지는 날",
    situation: "며칠은 필수인원이 2명 이상 빠져요.",
    judgment: "그런 날은 회의를 잡기 어려워요. 순위 맨 아래로 내리고 빨간색으로 강하게 경고해요.",
    banner: {
      tone: "danger",
      text: "빨간 날짜는 필수인원이 2명 이상 빠져요. 이 날로는 회의를 잡지 않는 걸 권해요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [
      { dateIndex: 1, startMin: H(14), busy: [0, 1] },
      { dateIndex: 2, startMin: H(10), busy: [2, 3] },
      { dateIndex: 0, startMin: H(15), busy: [0, 1, 4] },
    ],
  },
  {
    id: 7,
    title: "아직 응답 안 한 사람 있음",
    situation: "참석자 6명 중 2명이 아직 불가능 시간을 입력하지 않았어요. (필수인원 1명 포함)",
    judgment:
      "전원이 응답하기 전엔 잠정 결과만 보여줘요. 미응답자는 가능 인원으로 세지 않아요.",
    banner: {
      tone: "caution",
      text: "아직 응답하지 않은 사람이 있어 잠정 결과만 보여줘요. 모두 응답하면 modu가 가장 나은 시간을 찾아드려요.",
    },
    submitted: 4,
    pendingNames: ["최수아", "한예린"],
    slots: [
      { dateIndex: 2, startMin: H(10), busy: [] },
      { dateIndex: 1, startMin: H(14), busy: [4] },
      { dateIndex: 0, startMin: H(15), busy: [1] },
    ],
  },
  {
    id: 8,
    title: "비슷한 후보가 여러 개 있음",
    situation: "전원 또는 대부분이 참석할 수 있는 후보가 여러 개 있어요.",
    judgment:
      "억지로 순위를 나누지 않고 같은 그룹으로 묶어 보여줘요. 화면에서는 더 이른 날짜와 시간을 먼저 보여줘요.",
    banner: {
      tone: "info",
      text: "비슷하게 좋은 후보는 한 그룹으로 묶어 보여줘요. 더 이른 시간이 먼저예요.",
    },
    submitted: 6,
    pendingNames: [],
    slots: [
      // 전원 가능한 후보가 여러 개(같은 그룹) + 두 명 빠지는 아래 그룹 하나
      { dateIndex: 1, startMin: H(14), busy: [] },
      { dateIndex: 2, startMin: H(10), busy: [] },
      { dateIndex: 0, startMin: H(15), busy: [4, 5] },
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

export function buildCaseCandidates(c: DemoCase, dates: string[]): CaseCandidate[] {
  if (dates.length === 0) return [];
  const demoDates = resolveDemoDates(dates);
  const pending = new Set(c.pendingNames);

  // 케이스 슬롯이 없는 나머지 미래 평일은 불가 입력이 없는 날 = '전원 가능' 후보로 그대로 올린다.
  const usedIdx = new Set(
    c.slots.map((s) => Math.max(0, Math.min(s.dateIndex, demoDates.length - 1))),
  );
  const slots: DemoSlot[] = [...c.slots];
  demoDates.forEach((_, di) => {
    if (!usedIdx.has(di)) slots.push({ dateIndex: di, startMin: H(10), busy: [] });
  });

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
    for (const slot of c.slots) {
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
