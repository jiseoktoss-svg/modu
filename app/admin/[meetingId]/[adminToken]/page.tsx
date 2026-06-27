import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck2 } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ExpiryNotice } from "@/components/layout/ExpiryNotice";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ParticipantResponseList } from "@/components/scheduler/ParticipantResponseList";
import { RecommendationList } from "@/components/scheduler/RecommendationList";
import { AvailabilitySummaryCalendar } from "@/components/scheduler/AvailabilitySummaryCalendar";
import {
  fetchBlocks,
  fetchMeeting,
  fetchParticipants,
  fetchVotes,
  toSchedulerInput,
} from "@/lib/data";
import { recommendSlots } from "@/lib/scheduler";
import { describeDateStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  params,
}: {
  params: { meetingId: string; adminToken: string };
}) {
  const meeting = await fetchMeeting(params.meetingId);
  if (!meeting || meeting.adminToken !== params.adminToken) notFound();

  const [participants, blocks, votes] = await Promise.all([
    fetchParticipants(meeting.id),
    fetchBlocks(meeting.id),
    fetchVotes(meeting.id),
  ]);
  const recommendations = recommendSlots(toSchedulerInput(meeting, participants, blocks));
  const votedParticipantIds = new Set(votes.map((vote) => vote.participantId));
  const allResponsesSubmitted =
    participants.length > 0 && participants.every((p) => p.responseStatus === "submitted");
  const allVotesSubmitted =
    allResponsesSubmitted && participants.every((p) => votedParticipantIds.has(p.id));
  const voteCounts = votes.reduce<Record<string, number>>((acc, vote) => {
    const key = `${vote.startAt}|${vote.endAt}`;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const start = describeDateStr(meeting.dateStart);
  const end = describeDateStr(meeting.dateEnd);
  const dateLabel =
    meeting.dateStart === meeting.dateEnd ? start.monthDay : `${start.monthDay}~${end.monthDay}`;

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            {meeting.title}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone="gray">
              {dateLabel}
            </Badge>
            <Badge tone="gray">{meeting.durationMinutes}분 회의</Badge>
            {meeting.location && <Badge tone="gray">장소 {meeting.location}</Badge>}
          </div>
          {meeting.agenda && (
            <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">
              안건: {meeting.agenda}
            </p>
          )}
        </header>

        {meeting.confirmedSlotId && (
          <Link href={`/meetings/${meeting.id}/confirmed`} className="block">
            <Card className="flex items-center gap-3 border-green-200 bg-green-50">
              <CalendarCheck2 className="shrink-0 text-green-600" size={20} />
              <div className="text-sm">
                <p className="font-semibold text-green-800">이미 확정된 회의예요</p>
                <p className="text-green-700">
                  확정 화면에서 공유 문구와 캘린더 파일을 볼 수 있어요.
                </p>
              </div>
            </Card>
          </Link>
        )}

        <ParticipantResponseList
          participants={participants}
          meetingId={meeting.id}
          adminToken={meeting.adminToken}
        />

        <AvailabilitySummaryCalendar
          meeting={meeting}
          participants={participants}
          blocks={blocks}
        />

        {!meeting.confirmedSlotId && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">후보 시간대 투표</h2>
              <span className="text-sm text-slate-500">다수결 기준</span>
            </div>
            <RecommendationList
              candidates={recommendations}
              meetingId={meeting.id}
              adminToken={meeting.adminToken}
              voteCounts={voteCounts}
              allResponsesSubmitted={allResponsesSubmitted}
              allVotesSubmitted={allVotesSubmitted}
            />
          </section>
        )}

        <ExpiryNotice className="pt-4" />
      </main>
    </div>
  );
}
