import { notFound } from "next/navigation";
import { DebugPageTag } from "@/components/dev/DebugPageTag";
import { MobileHeaderTitle } from "@/components/layout/MobileHeaderTitle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ResponseForm } from "@/components/scheduler/ResponseForm";
import { Card, CardTitle } from "@/components/ui/Card";
import { Emoji } from "@/components/ui/Emoji";
import { TDSButton } from "@/components/ui/TDSButton";
import { fetchMeeting, fetchParticipants, toPublicParticipant } from "@/lib/data";
import { eachDateInRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  const meeting = await fetchMeeting(meetingId);
  if (!meeting) notFound();

  const participants = (await fetchParticipants(meeting.id)).map(toPublicParticipant);
  const dates = eachDateInRange(meeting.dateStart, meeting.dateEnd);

  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      <SiteHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 pt-4 sm:px-6 sm:pt-8">
        {meeting.confirmedSlotId ? (
          <>
            <DebugPageTag no={12} label="확정 안내" />
            <MobileHeaderTitle title="확정된 회의" />
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              {meeting.title}
            </h1>
            <div className="mt-6">
              <Card className="space-y-4 text-center">
                <Emoji symbol="📅" size={36} className="mx-auto" />
                <div>
                  <CardTitle>회의 시간이 정해졌어요</CardTitle>
                  <p className="mt-2 text-sm text-slate-600">
                    확정된 회의는 응답을 수정할 수 없어요.
                  </p>
                </div>
                <TDSButton as="a" href={`/meetings/${meeting.id}/confirmed`} size="xl">
                  확정 시간 보기
                </TDSButton>
              </Card>
            </div>
          </>
        ) : (
          <ResponseForm
            meetingId={meeting.id}
            meetingTitle={meeting.title}
            agenda={meeting.agenda}
            location={meeting.location}
            deadlineDate={meeting.dateEnd}
            responseDeadline={meeting.responseDeadline}
            durationMinutes={meeting.durationMinutes}
            dates={dates}
            workdayStart={meeting.workdayStart}
            workdayEnd={meeting.workdayEnd}
            lunchStart={meeting.lunchStart}
            lunchEnd={meeting.lunchEnd}
            initialParticipants={participants}
          />
        )}
      </main>
    </div>
  );
}
