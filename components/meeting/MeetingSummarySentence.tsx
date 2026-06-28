import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

// 회의 생성 화면(MeetingCreateForm) 상단 안내 문장을 읽기 전용으로 재사용한다.
// 참가자 이름/명수는 의도적으로 제외한다.

const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"];

// MeetingCreateForm의 formatDeadline과 동일한 형식("2026년 6월 28일 일요일").
function formatDeadline(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return "";
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${y}년 ${m}월 ${d}일 ${WEEKDAYS_KO[wd]}요일`;
}

// 문장 안에서 강조되는 값(생성 화면의 파란 강조와 동일한 톤).
function Val({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-brand-600">{children}</span>;
}

interface MeetingSummarySentenceProps {
  title: string;
  agenda: string;
  location: string;
  deadlineDate: string; // YYYY-MM-DD (meeting.dateEnd)
  durationMinutes: number;
  className?: string;
}

export function MeetingSummarySentence({
  title,
  agenda,
  location,
  deadlineDate,
  durationMinutes,
  className,
}: MeetingSummarySentenceProps) {
  const deadlineText = formatDeadline(deadlineDate);
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  // 값이 0인 시간/분은 숨긴다(생성 화면과 동일한 규칙).
  const showMin = mins > 0;
  const showHours = hours > 0 || !showMin;

  return (
    <div
      className={cn(
        "break-keep text-2xl leading-relaxed text-slate-800 sm:text-3xl sm:leading-relaxed",
        className,
      )}
    >
      <p>
        이번 회의명은 <Val>{title}</Val> 에요.{" "}
        {agenda.trim() !== "" && (
          <>
            회의 안건은 <Val>{agenda}</Val> 입니다.{" "}
          </>
        )}
        {location.trim() !== "" && (
          <>
            회의 장소는 <Val>{location}</Val> 이며,{" "}
          </>
        )}
        {deadlineText !== "" && (
          <>
            <Val>{deadlineText}</Val> 까지는 회의가 완료되어야 해요.{" "}
          </>
        )}
        예상 회의 진행 시간은{" "}
        {showHours && (
          <>
            <Val>{hours}</Val> 시간{showMin ? " " : ""}
          </>
        )}
        {showMin && (
          <>
            <Val>{mins}</Val> 분
          </>
        )}{" "}
        입니다.
      </p>
    </div>
  );
}
