import { SiteHeader } from "@/components/layout/SiteHeader";
import { MeetingCreateForm } from "@/components/meeting/MeetingCreateForm";
import { addDaysToDateStr, todayDateStrKst } from "@/lib/time";

export default function NewMeetingPage() {
  const today = todayDateStrKst(new Date());
  const defaultDeadlineDate = addDaysToDateStr(today, 7);

  return (
    <div className="min-h-screen bg-slate-50">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
          회의 만들기
        </h1>
        <div className="mt-6">
          <MeetingCreateForm defaultDeadlineDate={defaultDeadlineDate} minDeadlineDate={today} />
        </div>
      </main>
    </div>
  );
}
