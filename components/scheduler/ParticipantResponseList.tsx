import { Badge } from "@/components/ui/Badge";
import { Card, CardTitle } from "@/components/ui/Card";
import { AttendanceTypeToggle } from "@/components/scheduler/AttendanceTypeToggle";
import type { Participant } from "@/lib/types";

interface Props {
  participants: Participant[];
  meetingId: string;
  adminToken: string;
}

export function ParticipantResponseList({ participants, meetingId, adminToken }: Props) {
  const respondedCount = participants.filter((p) => p.responseStatus === "submitted").length;
  const pending = participants.filter((p) => p.responseStatus === "pending");

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <CardTitle>참석자 응답</CardTitle>
        <span className="text-sm font-medium text-slate-500">
          {respondedCount}/{participants.length} 응답
        </span>
      </div>

      <ul className="divide-y divide-slate-100">
        {participants.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-3">
            <p className="min-w-0 truncate font-semibold text-slate-900">
              {p.name}
              {p.role && (
                <span className="ml-2 text-sm font-normal text-slate-500">{p.role}</span>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <AttendanceTypeToggle
                meetingId={meetingId}
                adminToken={adminToken}
                participantId={p.id}
                value={p.attendanceType}
              />
              <Badge tone={p.responseStatus === "submitted" ? "green" : "gray"}>
                {p.responseStatus === "submitted" ? "응답함" : "미응답"}
              </Badge>
            </div>
          </li>
        ))}
      </ul>

      {pending.length > 0 && (
        <p className="text-xs text-slate-500">
          미응답: {pending.map((p) => p.name).join(", ")}
        </p>
      )}
    </Card>
  );
}
