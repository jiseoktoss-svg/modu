import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreateForm } from "@/components/meeting/MeetingCreateForm";
import { fetchMeeting, fetchParticipants } from "@/lib/data";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams?: { meetingId?: string; adminToken?: string };
}) {
  const today = todayDateStrKst(new Date());
  const defaultDeadlineDate = addDaysToDateStr(today, 7);
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
    <div className="flex h-dvh flex-col overflow-hidden bg-white/95 sm:h-auto sm:min-h-screen sm:overflow-visible">
      <SiteHeader />
      <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreateForm
          defaultDeadlineDate={defaultDeadlineDate}
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
