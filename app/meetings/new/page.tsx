import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreateForm } from "@/components/meeting/MeetingCreateForm";
import { fetchMeeting, fetchParticipants } from "@/lib/data";
import { getKstParts, todayDateStrKst } from "@/lib/time";

function splitKstDeadline(iso: string): { date: string; time: string } {
  const p = getKstParts(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hours)}:${pad(p.minutes)}`,
  };
}

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams?: { meetingId?: string; adminToken?: string };
}) {
  const today = todayDateStrKst(new Date());
  const editMeetingId = searchParams?.meetingId;
  const editAdminToken = searchParams?.adminToken;

  const editMeeting =
    editMeetingId != null && editAdminToken != null ? await fetchMeeting(editMeetingId) : null;

  if ((editMeetingId != null || editAdminToken != null) && !editMeeting) {
    notFound();
  }

  if (editMeeting && editMeeting.adminToken !== editAdminToken) {
    notFound();
  }

  const editParticipants = editMeeting ? await fetchParticipants(editMeeting.id) : [];

  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreateForm
          minDeadlineDate={today}
          initialMeeting={
            editMeeting
              ? {
                  id: editMeeting.id,
                  adminToken: editMeeting.adminToken,
                  title: editMeeting.title,
                  agenda: editMeeting.agenda,
                  location: editMeeting.location,
                  deadlineDate: editMeeting.dateEnd,
                  responseDeadlineDate: editMeeting.responseDeadline
                    ? splitKstDeadline(editMeeting.responseDeadline).date
                    : undefined,
                  responseDeadlineTime: editMeeting.responseDeadline
                    ? splitKstDeadline(editMeeting.responseDeadline).time
                    : undefined,
                  durationMinutes: editMeeting.durationMinutes,
                  participants: editParticipants.map((participant) => ({
                    name: participant.name,
                    role: participant.role,
                    attendanceType: participant.attendanceType,
                  })),
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}
