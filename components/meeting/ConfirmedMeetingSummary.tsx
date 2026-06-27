import { CalendarDays, Clock, Download, MapPin, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatKoreanDate, formatKoreanTimeRange } from "@/lib/time";
import type { ConfirmedSlot, Meeting } from "@/lib/types";

interface Props {
  meeting: Meeting;
  slot: ConfirmedSlot;
  requiredCount: number;
  optionalCount: number;
  requiredAllAvailable: boolean;
}

export function ConfirmedMeetingSummary({
  meeting,
  slot,
  requiredCount,
  optionalCount,
  requiredAllAvailable,
}: Props) {
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="space-y-1">
          <span className="text-sm font-semibold text-brand-600">확정된 회의</span>
          <CardTitle className="text-xl">{meeting.title}</CardTitle>
        </div>

        <dl className="space-y-3 text-sm">
          {meeting.agenda && (
            <div className="flex items-center gap-3">
              <dt className="w-5 text-slate-400">안건</dt>
              <dd className="font-medium text-slate-800">{meeting.agenda}</dd>
            </div>
          )}
          {meeting.location && (
            <div className="flex items-center gap-3">
              <MapPin size={18} className="text-slate-400" />
              <dt className="sr-only">장소</dt>
              <dd className="font-medium text-slate-800">{meeting.location}</dd>
            </div>
          )}
          <div className="flex items-center gap-3">
            <CalendarDays size={18} className="text-slate-400" />
            <dt className="sr-only">날짜</dt>
            <dd className="font-medium text-slate-800">{formatKoreanDate(slot.startAt)}</dd>
          </div>
          <div className="flex items-center gap-3">
            <Clock size={18} className="text-slate-400" />
            <dt className="sr-only">시간</dt>
            <dd className="font-medium text-slate-800">
              {formatKoreanTimeRange(slot.startAt, slot.endAt)} · {meeting.durationMinutes}분
            </dd>
          </div>
          <div className="flex items-center gap-3">
            <Users size={18} className="text-slate-400" />
            <dt className="sr-only">참석 대상</dt>
            <dd className="font-medium text-slate-800">
              필수 {requiredCount}명 · 선택 {optionalCount}명
            </dd>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck size={18} className="text-slate-400" />
            <dt className="sr-only">필수 참석자 충족 여부</dt>
            <dd>
              <Badge tone={requiredAllAvailable ? "green" : "amber"}>
                {requiredAllAvailable
                  ? "필수 참석자 모두 참석 가능"
                  : "필수 참석자 일부 미응답·불가"}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="space-y-3">
        <CardTitle className="text-base">공유 문구</CardTitle>
        <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
          {slot.summaryText}
        </pre>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={slot.summaryText} label="공유 문구 복사" variant="primary" />
          <a
            href={`/api/meetings/${meeting.id}/ics`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50"
          >
            <Download size={16} />
            캘린더 파일(.ics) 받기
          </a>
        </div>
        <p className="text-xs text-slate-500">
          실제 이메일이나 캘린더 초대는 보내지 않아요. 문구와 파일을 직접 공유해 주세요.
        </p>
      </Card>
    </div>
  );
}
