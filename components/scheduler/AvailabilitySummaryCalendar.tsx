import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { describeDateStr, eachDateInRange, kstWallToIso, parseHm } from "@/lib/time";
import type { AvailabilityBlock, Meeting, Participant } from "@/lib/types";

interface Props {
  meeting: Meeting;
  participants: Participant[];
  blocks: AvailabilityBlock[];
}

type DayStatus = "available" | "preferred" | "busy" | "pending";

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function epoch(iso: string): number {
  return Date.parse(iso);
}

function statusForDay(
  participant: Participant,
  dayBlocks: AvailabilityBlock[],
  dayStart: number,
  dayEnd: number,
): DayStatus {
  if (participant.responseStatus !== "submitted") return "pending";
  const statuses = dayBlocks
    .filter(
      (b) =>
        b.participantId === participant.id &&
        overlaps(dayStart, dayEnd, epoch(b.startAt), epoch(b.endAt)),
    )
    .map((b) => b.status);

  if (statuses.includes("busy")) return "busy";
  if (statuses.includes("preferred")) return "preferred";
  return "available";
}

export function AvailabilitySummaryCalendar({ meeting, participants, blocks }: Props) {
  const dates = eachDateInRange(meeting.dateStart, meeting.dateEnd);
  const submitted = participants.filter((p) => p.responseStatus === "submitted");
  const workStart = parseHm(meeting.workdayStart);
  const workEnd = parseHm(meeting.workdayEnd);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="text-base">전체 캘린더</CardTitle>
        <Badge tone={submitted.length === participants.length ? "green" : "gray"}>
          {submitted.length}/{participants.length} 응답
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {dates.map((date) => {
          const dayStart = epoch(kstWallToIso(date, workStart));
          const dayEnd = epoch(kstWallToIso(date, workEnd));
          const statuses = participants.map((p) =>
            statusForDay(p, blocks, dayStart, dayEnd),
          );
          const preferred = statuses.filter((s) => s === "preferred").length;
          const busy = statuses.filter((s) => s === "busy").length;
          const pending = statuses.filter((s) => s === "pending").length;
          const available = statuses.filter((s) => s === "available").length;
          const { weekdayKo, monthDay } = describeDateStr(date);

          return (
            <div
              key={date}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-slate-900">{monthDay}</p>
                <span className="text-sm text-slate-500">{weekdayKo}요일</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="green">가능 {available}</Badge>
                <Badge tone="blue">선호 {preferred}</Badge>
                <Badge tone="red">불가 {busy}</Badge>
                {pending > 0 && <Badge tone="gray">미응답 {pending}</Badge>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
