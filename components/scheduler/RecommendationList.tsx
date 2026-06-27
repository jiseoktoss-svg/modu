import { Info, SearchX } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { RecommendationCard } from "@/components/scheduler/RecommendationCard";
import type { SlotCandidate } from "@/lib/scheduler";

interface Props {
  candidates: SlotCandidate[];
  meetingId: string;
  adminToken: string;
  voteCounts?: Record<string, number>;
  allResponsesSubmitted?: boolean;
  allVotesSubmitted?: boolean;
}

function keyOf(startAt: string, endAt: string) {
  return `${startAt}|${endAt}`;
}

export function RecommendationList({
  candidates,
  meetingId,
  adminToken,
  voteCounts = {},
  allResponsesSubmitted = false,
  allVotesSubmitted = false,
}: Props) {
  if (candidates.length === 0) {
    return (
      <Card className="space-y-2 text-center">
        <SearchX size={32} className="mx-auto text-slate-300" />
        <CardTitle>추천할 수 있는 시간이 없어요</CardTitle>
        <p className="text-sm text-slate-600">
          필수 참석자가 모두 가능한 시간이 아직 없어요. 다른 회의 날짜로 새로 만들거나,
          필수 참석자를 줄이거나, 참석자들에게 가능한 시간을 더 입력해 달라고 요청해 보세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {candidates.length < 3 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <Info size={16} className="mt-0.5 shrink-0" />
          조건을 만족하는 후보가 {candidates.length}개뿐이에요. 다른 회의 날짜로 새로
          만들거나 필수 참석자를 조정하면 후보가 늘어날 수 있어요.
        </p>
      )}
      {candidates.map((c) => {
        const counts = candidates.map(
          (candidate) => voteCounts[keyOf(candidate.startAt, candidate.endAt)] ?? 0,
        );
        const maxVotes = counts.length ? Math.max(...counts) : 0;
        const topCount = counts.filter((count) => count === maxVotes && count > 0).length;
        const voteCount = voteCounts[keyOf(c.startAt, c.endAt)] ?? 0;
        const isTop = maxVotes > 0 && voteCount === maxVotes;
        const canConfirm = allVotesSubmitted && isTop;
        const voteNotice = !allResponsesSubmitted
          ? "모든 참석자가 응답하면 후보 시간대 투표를 시작할 수 있어요."
          : !allVotesSubmitted
            ? "모든 참석자의 후보 투표가 모이면 최다 득표 후보를 확정할 수 있어요."
            : topCount > 1
              ? "최다 득표가 동률이에요. 1위 후보 중 하나를 골라 확정하세요."
              : "최다 득표 후보를 확정할 수 있어요.";
        return (
          <RecommendationCard
            key={`${c.startAt}`}
            candidate={c}
            meetingId={meetingId}
            adminToken={adminToken}
            voteCount={voteCount}
            hasVotes={maxVotes > 0}
            canConfirm={canConfirm}
            voteNotice={voteNotice}
          />
        );
      })}
    </div>
  );
}
