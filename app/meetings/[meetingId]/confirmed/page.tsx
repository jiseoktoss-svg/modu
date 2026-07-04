import Link from "next/link";
import { notFound } from "next/navigation";
import { DebugPageTag } from "@/components/dev/DebugPageTag";
import { MobileHeaderTitle } from "@/components/layout/MobileHeaderTitle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { ConfirmedMeetingSummary } from "@/components/meeting/ConfirmedMeetingSummary";
import {
  fetchBlocks,
  fetchConfirmedSlot,
  fetchMeeting,
  fetchParticipants,
  isRequiredAllAvailable,
} from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) notFound();

  const slot = meeting.confirmedSlotId
    ? await fetchConfirmedSlot(meeting.confirmedSlotId)
    : null;

  const [participants, blocks] = slot
    ? await Promise.all([fetchParticipants(meeting.id), fetchBlocks(meeting.id)])
    : [[], []];
  const requiredCount = participants.filter((p) => p.attendanceType === "required").length;
  const optionalCount = participants.length - requiredCount;
  const requiredAllAvailable = slot
    ? isRequiredAllAvailable(
        participants,
        blocks,
        slot.startAt,
        slot.endAt,
      )
    : false;

  return (
    <div className="min-h-dvh bg-white/95">
      <DebugPageTag no={11} label="확정된 회의" />
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 pb-10 pt-4 sm:px-6 sm:pt-10">
        <MobileHeaderTitle title="확정된 회의" />
        {slot ? (
          <ConfirmedMeetingSummary
            meeting={meeting}
            slot={slot}
            requiredCount={requiredCount}
            optionalCount={optionalCount}
            requiredAllAvailable={requiredAllAvailable}
          />
        ) : (
          <Card className="space-y-3 text-center">
            <CardTitle>아직 확정 전이에요</CardTitle>
            <p className="text-sm text-slate-600">
              이 회의는 아직 시간이 확정되지 않았어요. 현재 플로우에서는 modu가
              회의 시간을 확정하지 않고, 추천안을 바탕으로 참여자들이 최종 시간을 정해요.
            </p>
            <div>
              <Link href="/" className="text-sm font-semibold text-brand-600">
                홈으로
              </Link>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
