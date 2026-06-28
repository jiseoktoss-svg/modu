import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreatedPanel } from "@/components/meeting/MeetingCreatedPanel";
import { fetchMeeting, fetchParticipants } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: { meetingId: string; adminToken: string };
}) {
  const meeting = await fetchMeeting(params.meetingId);
  if (!meeting || meeting.adminToken !== params.adminToken) notFound();
  const participants = await fetchParticipants(meeting.id);

  return (
    <div className="flex min-h-screen flex-col bg-white/95">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreatedPanel meeting={meeting} participants={participants} />
      </main>
    </div>
  );
}
