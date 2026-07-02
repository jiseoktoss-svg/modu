import { notFound } from "next/navigation";
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
          <MeetingShareError />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreatedPanel meeting={meeting} participants={participants} />
      </main>
    </div>
  );
}
