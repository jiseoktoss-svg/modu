"use client";

import { Fragment } from "react";
import { CharFillSentence } from "@/components/ui/CharFillSentence";
import { cn } from "@/lib/cn";
import { hasBatchim } from "@/lib/korean";
import { formatKoreanDateNoYear, formatKoreanTime } from "@/lib/time";
import type { CharFillSegment } from "@/lib/charFill";

// 회의 생성 화면(MeetingCreateForm) 상단 안내 문장을 읽기 전용으로 재사용한다.
// 참가자 이름/명수는 의도적으로 제외하고, 날짜값은 년도 없이 표시한다.
// fill 이면 회의 확인 화면과 동일한 글자 잉크 채움(CharFillSentence)으로 등장하고,
// 채움이 끝나면 값에 shine 을 켠다.

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// MeetingCreateForm 확인 화면과 동일한 형식("6월 28일 일요일" — 년도 없음).
function formatDeadline(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}월 ${d}일 ${WEEKDAYS_KO[wd]}요일`;
}

// 강조 값 조각(생성 화면의 파란 강조와 동일한 톤, shine 은 채움 완료 후 점등).
function summaryValue(text: string): CharFillSegment {
  return {
    text,
    wrap: (chars, shine) => (
      <span className={cn("font-bold text-brand-600", shine && "modu-value-shine")}>{chars}</span>
    ),
  };
}

interface MeetingSummarySentenceProps {
  title: string;
  agenda: string;
  location: string;
  deadlineDate: string; // YYYY-MM-DD (meeting.dateEnd)
  responseDeadline?: string | null; // ISO(+09:00), 응답 마감 시각
  durationMinutes: number;
  /** true 면 글자 잉크 채움으로 등장(회의 안내 intro). false 면 즉시 완성 문장 + shine. */
  fill?: boolean;
  /** 채움이 모두 끝난 시점(mask 해제·shine 점등)에 한 번 호출된다. fill 일 때만. */
  onFillDone?: () => void;
  className?: string;
}

export function MeetingSummarySentence({
  title,
  agenda,
  location,
  deadlineDate,
  responseDeadline,
  durationMinutes,
  fill = false,
  onFillDone,
  className,
}: MeetingSummarySentenceProps) {
  const deadlineText = formatDeadline(deadlineDate);
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  // 값이 0인 시간/분은 숨긴다(생성 화면과 동일한 규칙).
  const showMin = mins > 0;
  const showHours = hours > 0 || !showMin;

  // 문장을 절(clause) 단위로 구성한다(글자 채움의 절 사이 호흡 기준).
  const clauses: CharFillSegment[][] = [];
  clauses.push([
    "일정 이름은 ",
    summaryValue(title),
    hasBatchim(title) ? " 이에요." : " 예요.",
  ]);
  if (agenda.trim() !== "") {
    clauses.push([
      "일정 내용은 ",
      summaryValue(agenda),
      hasBatchim(agenda) ? " 이에요." : " 예요.",
    ]);
  }
  if (location.trim() !== "") {
    clauses.push(["장소는 ", summaryValue(location), " 이고,"]);
  }
  {
    const duration: CharFillSegment[] = ["예상 소요 시간은 "];
    if (showHours) duration.push(summaryValue(String(hours)), showMin ? " 시간 " : " 시간");
    if (showMin) duration.push(summaryValue(String(mins)), " 분");
    duration.push(" 이에요.");
    clauses.push(duration);
  }
  if (deadlineText !== "") {
    clauses.push([summaryValue(deadlineText), " 까지 가능한 시간을 찾아볼게요."]);
  }
  if (responseDeadline) {
    clauses.push([
      "응답은 ",
      summaryValue(
        `${formatKoreanDateNoYear(responseDeadline)} ${formatKoreanTime(responseDeadline)}`,
      ),
      " 까지 부탁드려요.",
    ]);
  }

  if (fill) {
    return (
      <CharFillSentence
        className={className}
        paragraphs={[{ clauses }]}
        onFillDone={onFillDone}
      />
    );
  }

  // 채움 없이 즉시 완성 문장(값 shine 포함)으로 렌더한다.
  return (
    <div
      className={cn(
        "break-keep text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed",
        className,
      )}
    >
      <p>
        {clauses.map((clause, ci) => (
          <span key={ci}>
            {clause.map((seg, i) =>
              typeof seg === "string" ? (
                <span key={i}>{seg}</span>
              ) : (
                <Fragment key={i}>{seg.wrap(seg.text, true)}</Fragment>
              ),
            )}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
