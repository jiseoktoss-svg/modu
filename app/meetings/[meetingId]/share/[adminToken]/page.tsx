import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ExpiryNotice } from "@/components/layout/ExpiryNotice";
import { ShareLinksPanel } from "@/components/meeting/ShareLinksPanel";
import { Emoji } from "@/components/ui/Emoji";
import { fetchMeeting } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SharePage({
  params,
}: {
  params: { meetingId: string; adminToken: string };
}) {
  const meeting = await fetchMeeting(params.meetingId);
  if (!meeting || meeting.adminToken !== params.adminToken) notFound();

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Emoji symbol="🎉" size={22} />
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
            회의가 만들어졌어요
          </h1>
        </div>

        <ShareLinksPanel meetingId={meeting.id} />

        <ExpiryNotice className="mt-10" />
      </main>
    </div>
  );
}
