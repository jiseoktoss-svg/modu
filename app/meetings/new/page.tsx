import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreateForm } from "@/components/meeting/MeetingCreateForm";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

export default function NewMeetingPage() {
  const today = todayDateStrKst(new Date());
  const defaultDeadlineDate = addDaysToDateStr(today, 7);

  return (
    <div className="flex min-h-screen flex-col bg-[#fafaf8]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 sm:px-6">
        <MeetingCreateForm defaultDeadlineDate={defaultDeadlineDate} minDeadlineDate={today} />
      </main>
    </div>
  );
}
