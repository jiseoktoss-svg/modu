"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { TDSButton } from "@/components/ui/TDSButton";
import { cn } from "@/lib/cn";
import { isoToEpoch, kstWallToIso, parseHm } from "@/lib/time";
import {
  lookupAvailabilityAtTime,
  type AvailabilityLookupBlock,
  type AvailabilityLookupParticipant,
  type AvailabilityLookupResult,
} from "@/lib/scheduler/availabilityLookup";
import { parseAvailabilitySearch } from "@/lib/scheduler/parseAvailabilitySearch";

// 특정 날짜·시간 검색 입력 — 추천안/캘린더 화면 공용.
// 검색은 조회(탐색 보조) 기능일 뿐 회의 시간을 확정하거나 투표하지 않는다.
// 주말·근무시간 밖도 막지 않고 참고용으로 보여준다(안내 문구만 붙인다).

type AvailabilitySearchBoxProps = {
  dates: string[];
  durationMinutes: number;
  participants: AvailabilityLookupParticipant[];
  blocks: AvailabilityLookupBlock[];
  onResult: (result: AvailabilityLookupResult) => void;
  /** 근무시간 밖 안내용(HH:MM). 없으면 서버 기본 근무시간과 동일한 09:00~18:00. */
  workdayStart?: string;
  workdayEnd?: string;
  className?: string;
};

function isWeekendDateStr(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function AvailabilitySearchBox({
  dates,
  durationMinutes,
  participants,
  blocks,
  onResult,
  workdayStart = "09:00",
  workdayEnd = "18:00",
  className,
}: AvailabilitySearchBoxProps) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const handleSearch = () => {
    const parsed = parseAvailabilitySearch(query, { dates });
    if (!parsed.ok) {
      setNote(null);
      setError(parsed.error);
      return;
    }

    const startAt = kstWallToIso(parsed.date, parsed.startMinute);
    // 범위를 직접 입력하지 않았으면 회의 길이만큼 본다. 자정을 넘겨도 epoch 기준이라 안전하다.
    const endAt =
      parsed.endMinute !== undefined
        ? kstWallToIso(parsed.date, parsed.endMinute)
        : new Date(isoToEpoch(startAt) + durationMinutes * 60000).toISOString();

    // 참고용 안내: 주말/근무시간 밖도 막지 않고 결과는 보여준다.
    const endMinute = parsed.endMinute ?? parsed.startMinute + durationMinutes;
    if (isWeekendDateStr(parsed.date)) {
      setNote("주말은 추천 후보에서 제외돼요. 참고용으로 참석 가능 여부만 보여드릴게요.");
    } else if (parsed.startMinute < parseHm(workdayStart) || endMinute > parseHm(workdayEnd)) {
      setNote("회의 가능 시간 밖이에요. 그래도 참석 가능 여부는 참고로 확인할 수 있어요.");
    } else {
      setNote(null);
    }

    setError(null);
    onResult(lookupAvailabilityAtTime({ participants, blocks, startAt, endAt }));
  };

  return (
    <div className={className}>
      <p className="text-xs font-bold text-slate-500">특정 시간 확인</p>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="예: 7/15 14시"
            aria-label="특정 날짜 시간 검색"
            inputMode="text"
          />
        </div>
        <TDSButton size="md" className="h-11 shrink-0" onClick={handleSearch}>
          확인
        </TDSButton>
      </div>
      {error && (
        <p role="alert" className={cn("mt-1.5 break-keep text-xs font-medium text-red-600")}>
          {error}
        </p>
      )}
      {!error && note && (
        <p className="mt-1.5 break-keep text-xs text-slate-500">{note}</p>
      )}
    </div>
  );
}
