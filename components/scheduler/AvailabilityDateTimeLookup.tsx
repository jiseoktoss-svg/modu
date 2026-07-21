"use client";

import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { CalendarModal } from "@/components/scheduler/CalendarModal";
import { Emoji } from "@/components/ui/Emoji";
import { Select } from "@/components/ui/Select";
import { TDSButton } from "@/components/ui/TDSButton";
import { cn } from "@/lib/cn";
import { generateSlots } from "@/lib/scheduler/generateSlots";
import {
  lookupAvailabilityAtTime,
  type AvailabilityLookupBlock,
  type AvailabilityLookupParticipant,
  type AvailabilityLookupResult,
} from "@/lib/scheduler/availabilityLookup";
import { formatKoreanTime, isoToEpoch, kstWallToIso, parseHm } from "@/lib/time";

// 결과 캘린더의 '원하는 날짜·시간 확인' 입력 모듈 — 문법을 기억해 입력하는 검색창 대신
// 날짜/시간을 직접 골라 확인한다. 선택 가능한 시간 목록은 generateSlots 를 재사용해
// 선택 가능 시간·진행 시간·휴식 시간 규칙이 추천 후보와 어긋나지 않게 한다.
// 결과 카드는 부모가 본문에 렌더한다(이 모듈은 하단 고정 영역에 들어간다) — onResult 로 전달.
// 조회 전용 — 확정도 투표도 아니다.

type AvailabilityDateTimeLookupProps = {
  dates: string[];
  durationMinutes: number;
  participants: AvailabilityLookupParticipant[];
  blocks: AvailabilityLookupBlock[];
  workdayStart: string;
  workdayEnd: string;
  lunchStart: string;
  lunchEnd: string;
  /** 초기 선택 날짜. 없으면 첫 후보 날짜. */
  initialDate?: string | null;
  /** 확인 결과. `검색하기`를 눌렀을 때만 갱신되고, 날짜/시간만 바꿔서는 이전 결과가 유지된다. */
  onResult: (result: AvailabilityLookupResult | null) => void;
  className?: string;
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function fmtMD(ds: string): string {
  const [, m, d] = ds.split("-").map(Number);
  return `${m}월 ${d}일`;
}

export function AvailabilityDateTimeLookup({
  dates,
  durationMinutes,
  participants,
  blocks,
  workdayStart,
  workdayEnd,
  lunchStart,
  lunchEnd,
  initialDate,
  onResult,
  className,
}: AvailabilityDateTimeLookupProps) {
  const isMobile = useIsMobile();
  const sortedDates = useMemo(() => [...dates].sort(), [dates]);
  const [date, setDate] = useState<string | null>(initialDate ?? sortedDates[0] ?? null);
  const [modalOpen, setModalOpen] = useState(false);

  // 선택 가능한 시작 시간 — 추천 후보와 같은 규칙(하루 범위 안, 30분 단위,
  // 진행 시간이 날짜 경계를 넘는 시작 시간 제외). 날짜와 무관하게 동일하다.
  const timeOptions = useMemo(() => {
    const templateDate = date ?? sortedDates[0];
    if (!templateDate) return [];
    return generateSlots({
      durationMinutes,
      dateStart: templateDate,
      dateEnd: templateDate,
      workdayStart,
      workdayEnd,
      lunchStart,
      lunchEnd,
    }).map((slot) => formatKoreanTime(slot.startAt)); // "14:00"
  }, [date, sortedDates, durationMinutes, workdayStart, workdayEnd, lunchStart, lunchEnd]);

  const [timeHm, setTimeHm] = useState<string>("");
  // 시간 목록이 준비되면 첫 시간을 기본값으로 둔다(값이 유효하지 않게 되면 되돌림).
  useEffect(() => {
    if (timeOptions.length === 0) {
      setTimeHm("");
      return;
    }
    if (!timeOptions.includes(timeHm)) setTimeHm(timeOptions[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeOptions]);

  const canLookup = date !== null && timeHm !== "";

  const handleLookup = () => {
    if (!date || !timeHm) return;
    const startAt = kstWallToIso(date, parseHm(timeHm));
    const endAt = new Date(isoToEpoch(startAt) + durationMinutes * 60000).toISOString();
    const result = lookupAvailabilityAtTime({ participants, blocks, startAt, endAt });

    // 검색 결과 바텀시트를 열기 전에 날짜 모달 닫힘을 먼저 커밋한다.
    // 모바일에서 두 포털이 같은 프레임에 겹쳐 보이는 상태를 막는다.
    flushSync(() => setModalOpen(false));
    onResult(result);
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <div>
        <p className="text-base font-bold text-slate-800">궁금한 날짜와 시간이 있나요?</p>
        <p className="break-keep text-xs text-slate-500">
          날짜와 시간을 선택하면 누가 참여할 수 있는지 바로 확인할 수 있어요.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* 날짜 선택 — 응답 입력과 동일한 캘린더 모달을 재사용한다. */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={modalOpen}
          aria-label="확인할 날짜 선택"
          className="flex h-11 min-w-0 flex-1 items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 transition-colors hover:border-slate-400 focus:border-2 focus:border-brand-400 focus:outline-none focus:ring-0"
        >
          <span className={date ? "truncate font-semibold" : "text-slate-400"}>
            {date ? fmtMD(date) : "날짜 선택"}
          </span>
          <Emoji symbol="📅" size={16} />
        </button>
        {/* 시간 선택 — 30분 단위, 하루 범위 규칙은 추천 후보와 동일. */}
        <div className="min-w-0 flex-1">
          <Select
            variant="menu"
            aria-label="확인할 시간 선택"
            value={timeHm}
            onValueChange={setTimeHm}
            options={
              timeOptions.length > 0
                ? timeOptions.map((hm) => ({ value: hm, label: hm }))
                : [{ value: "", label: "시간 선택" }]
            }
          />
        </div>
      </div>

      <TDSButton
        type="button"
        tone="primary"
        size="xl"
        display="block"
        disabled={!canLookup}
        onClick={handleLookup}
      >
        검색하기
      </TDSButton>

      <CalendarModal
        open={modalOpen}
        title="확인할 날짜"
        subtitle="궁금한 날짜를 골라주세요"
        isMobile={isMobile}
        dates={sortedDates}
        selected={new Set(date ? [date] : [])}
        onToggle={(ds) => {
          setDate(ds);
          setModalOpen(false);
        }}
        tone="pref"
        animateMobileClose={false}
        onClose={() => setModalOpen(false)}
        onConfirm={() => setModalOpen(false)}
      />
    </div>
  );
}
