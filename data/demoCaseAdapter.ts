// DemoCase → EvaluatedSlot[] 어댑터.
// data/demoCases.ts(문서화된 8개 시나리오)는 그대로 두고, 맥락형 해석 레이어
// (lib/scheduler/contextualResult.ts)의 입력으로 변환만 한다.
// 덕분에 8개 케이스가 새 로직의 테스트 fixture 로 그대로 쓰인다.

import { buildCaseCandidates, type DemoCase } from "@/data/demoCases";
import type { EvaluatedSlot } from "@/lib/scheduler/contextualResult";

export function adaptDemoCaseToEvaluatedSlots(
  demoCase: DemoCase,
  dates: string[],
): EvaluatedSlot[] {
  return buildCaseCandidates(demoCase, dates).map((candidate) => {
    // absentRequired = 필수참석자 중 불가(busy). 미응답 필수는 pendingNames 쪽에 있다.
    const requiredBusyNames = candidate.absentRequired;
    const optionalBusyNames = candidate.busyNames.filter(
      (name) => !requiredBusyNames.includes(name),
    );
    const totalParticipants = candidate.requiredTotal + candidate.optionalTotal;

    return {
      startAt: candidate.startAt,
      endAt: candidate.endAt,
      date: candidate.date,

      requiredTotal: candidate.requiredTotal,
      optionalTotal: candidate.optionalTotal,
      totalParticipants,

      requiredAvailable: candidate.requiredAvail,
      optionalAvailable: candidate.optionalAvail,
      totalAvailable: candidate.availableNames.length,

      requiredBusyCount: requiredBusyNames.length,
      optionalBusyCount: optionalBusyNames.length,
      totalBusyCount: candidate.busyNames.length,

      requiredBusyNames,
      optionalBusyNames,
      pendingNames: candidate.pendingNames,

      isAllAvailable: candidate.availableNames.length === totalParticipants,
      isRequiredAllAvailable: requiredBusyNames.length === 0,
      isSoftAvoid: requiredBusyNames.length === 1,
      isHardAvoid: requiredBusyNames.length >= 2,
    };
  });
}
