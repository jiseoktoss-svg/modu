import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreateForm } from "@/components/meeting/MeetingCreateForm";
import { todayDateStrKst } from "@/lib/time";

export default function NewMeetingPage() {
  const today = todayDateStrKst(new Date());

  return (
    <div className="flex min-h-dvh flex-col bg-white/95">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreateForm minDeadlineDate={today} />
      </main>
    </div>
  );
}
