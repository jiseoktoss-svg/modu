import { notFound } from "next/navigation";
import { MobileHeaderTitle } from "@/components/layout/MobileHeaderTitle";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreatedPanel } from "@/components/meeting/MeetingCreatedPanel";
import { MeetingShareError } from "@/components/meeting/MeetingShareError";
import { fetchMeeting, fetchParticipants } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  let meeting;
  try {
    meeting = await fetchMeeting(meetingId);
  } catch (error) {
    console.error("[share] failed to load meeting", error);
    return (
      <div className="flex min-h-dvh flex-col bg-white/95">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
          <MobileHeaderTitle title="회의 만들기" hideBack />
          <MeetingShareError />
        </main>
      </div>
    );
  }
  if (!meeting) notFound();
  let participants;
  try {
    participants = await fetchParticipants(meeting.id);
  } catch (error) {
    console.error("[share] failed to load participants", error);
    return (
      <div className="flex min-h-dvh flex-col bg-white/95">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
          <MobileHeaderTitle title="회의 만들기" hideBack />
          <MeetingShareError />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      {/* 모바일에도 로고 헤더를 노출한다(뒤로가기 없이 로고만 — 완료 화면이라 이탈 동선은 두지 않음). 데스크톱도 로고 유지. */}
      <SiteHeader mobileLogo />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreatedPanel meeting={meeting} participants={participants} />
      </main>
    </div>
  );
}
