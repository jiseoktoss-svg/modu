import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ConfirmSlotButton } from "@/components/scheduler/ConfirmSlotButton";
import { IMPACT_STATUS_LABEL } from "@/lib/labels";
import { IMPACT_STATUS_TONE } from "@/lib/statusStyles";
import { formatKoreanDate, formatKoreanTimeRange } from "@/lib/time";
import {
  GRADE_LABELS,
  type RecommendationGrade,
  type SlotCandidate,
} from "@/lib/scheduler";

const GRADE_TONE: Record<RecommendationGrade, BadgeTone> = {
  best: "green",
  recommended: "brand",
  conditional: "amber",
  caution: "red",
};

interface Props {
  candidate: SlotCandidate;
  meetingId: string;
  adminToken: string;
  voteCount: number;
  canConfirm: boolean;
  hasVotes: boolean;
  voteNotice: string;
}

export function RecommendationCard({
  candidate: c,
  meetingId,
  adminToken,
  voteCount,
  canConfirm,
  hasVotes,
  voteNotice,
}: Props) {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{formatKoreanDate(c.startAt)}</p>
          <p className="text-lg font-bold text-slate-900">
            {formatKoreanTimeRange(c.startAt, c.endAt)}
          </p>
        </div>
        <Badge tone={GRADE_TONE[c.grade]} className="shrink-0">
          {GRADE_LABELS[c.grade]}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={c.requiredAllAvailable ? "green" : "amber"}>
          필수 {c.requiredAvailableCount}/{c.requiredTotalCount} 가능
        </Badge>
        {c.optionalTotalCount > 0 && (
          <Badge tone="gray">
            선택 {c.optionalAvailableCount}/{c.optionalTotalCount} 가능
          </Badge>
        )}
        {c.avoidConflictCount > 0 && <Badge tone="amber">비선호 {c.avoidConflictCount}건</Badge>}
        {c.preferredCount > 0 && <Badge tone="blue">선호 {c.preferredCount}명</Badge>}
        {c.afterLunch && <Badge tone="amber">점심 직후</Badge>}
        {c.hasPendingParticipants && <Badge tone="gray">미응답 {c.pendingCount}명</Badge>}
        <Badge tone={canConfirm ? "green" : "gray"}>
          {hasVotes ? `투표 ${voteCount}표` : "투표 대기"}
        </Badge>
      </div>

      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
        {c.reason}
      </p>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-500">참석자별 영향</p>
        <div className="flex flex-wrap gap-1.5">
          {c.impacts.map((im) => (
            <Badge key={im.participantId} tone={IMPACT_STATUS_TONE[im.status]}>
              <span className="font-semibold">{im.name}</span>
              <span className="opacity-70">{IMPACT_STATUS_LABEL[im.status]}</span>
            </Badge>
          ))}
        </div>
      </div>

      <div className="pt-1">
        {canConfirm ? (
          <ConfirmSlotButton
            meetingId={meetingId}
            adminToken={adminToken}
            startAt={c.startAt}
            endAt={c.endAt}
            label="다수결 1위로 확정"
          />
        ) : (
          <p className="text-sm text-slate-500">{voteNotice}</p>
        )}
      </div>
    </Card>
  );
}
