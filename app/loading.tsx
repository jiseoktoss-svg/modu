import { SiteHeader } from "@/components/layout/SiteHeader";

export default function Loading() {
  return (
    <div className="min-h-dvh bg-white/95">
      <SiteHeader />
      <main
        className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8 sm:px-6"
        aria-label="페이지 로딩 중"
      >
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-7 w-20 animate-pulse rounded-full bg-slate-200" />
          <div className="h-7 w-24 animate-pulse rounded-full bg-slate-200" />
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-5 w-1/3 animate-pulse rounded bg-slate-200" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
        </div>
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="h-5 w-1/2 animate-pulse rounded bg-slate-200" />
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          </div>
        </div>
      </main>
    </div>
  );
}
