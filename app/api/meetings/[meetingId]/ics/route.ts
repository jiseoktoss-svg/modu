import { fetchConfirmedSlot, fetchMeeting } from "@/lib/data";
import { buildIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;
  const meeting = await fetchMeeting(meetingId);
  if (!meeting || !meeting.confirmedSlotId) {
    return new Response("아직 확정된 회의가 없어요.", { status: 404 });
  }

  const slot = await fetchConfirmedSlot(meeting.confirmedSlotId);
  if (!slot) {
    return new Response("아직 확정된 회의가 없어요.", { status: 404 });
  }

  const ics = buildIcs(meeting, slot);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="moa-meeting.ics"',
    },
  });
}
