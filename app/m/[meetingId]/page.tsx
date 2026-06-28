import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ExpiryNotice } from "@/components/layout/ExpiryNotice";
import { ResponseForm } from "@/components/scheduler/ResponseForm";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Emoji } from "@/components/ui/Emoji";
import { fetchMeeting, fetchParticipants, toPublicParticipant } from "@/lib/data";
import { eachDateInRange } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
}: {
  params: { meetingId: string };
}) {
  const meeting = await fetchMeeting(params.meetingId);
  if (!meeting) notFound();

  const participants = (await fetchParticipants(meeting.id)).map(toPublicParticipant);
  const dates = eachDateInRange(meeting.dateStart, meeting.dateEnd);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
          {meeting.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          역할과 날짜별 가능 시간을 입력해 주세요. 모두가 응답하면 후보 시간대 투표가 열려요.
        </p>
        {(meeting.agenda || meeting.location) && (
          <div className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
            {meeting.agenda && <p>안건: {meeting.agenda}</p>}
            {meeting.location && <p>장소: {meeting.location}</p>}
          </div>
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500">
          <Emoji symbol="🛡️" size={14} />
          가능 여부와 선호 상태만 저장해요.
        </p>

        <div className="mt-6">
          {meeting.confirmedSlotId ? (
            <Card className="space-y-4 text-center">
              <Emoji symbol="📅" size={36} className="mx-auto" />
              <div>
                <CardTitle>회의 시간이 확정되었어요</CardTitle>
                <p className="mt-2 text-sm text-slate-600">
                  확정된 회의는 응답과 투표를 수정할 수 없어요.
                </p>
              </div>
              <Link href={`/meetings/${meeting.id}/confirmed`} className="inline-block">
                <Button>확정 시간 보기</Button>
              </Link>
            </Card>
          ) : (
            <ResponseForm
              meetingId={meeting.id}
              meetingTitle={meeting.title}
              dates={dates}
              workdayStart={meeting.workdayStart}
              workdayEnd={meeting.workdayEnd}
              lunchStart={meeting.lunchStart}
              lunchEnd={meeting.lunchEnd}
              initialParticipants={participants}
            />
          )}
        </div>

        <ExpiryNotice className="mt-10" />
      </main>
    </div>
  );
}
