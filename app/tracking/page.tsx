import { SiteHeader } from "@/components/layout/SiteHeader";
import { Card, CardTitle } from "@/components/ui/Card";
import { fetchTrackingSummary } from "@/lib/tracking";
import { hasTrackingAccess, hasTrackingPassword } from "@/lib/trackingAuth";
import type { TrackingCountRow, TrackingEvent, TrackingSummary } from "@/lib/trackingModel";
import type { ReactNode } from "react";
import { ClearTrackingForm } from "./ClearTrackingForm";
import { clearTrackingEventsAction, loginTracking, logoutTracking } from "./actions";

export const dynamic = "force-dynamic";

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ clearError?: string; cleared?: string; error?: string; setup?: string }>;
}) {
  const params = await searchParams;

  if (!hasTrackingPassword()) {
    return (
      <TrackingShell>
        <Card className="space-y-3">
          <CardTitle>트래킹 비밀번호 설정이 필요합니다</CardTitle>
          <p className="text-sm leading-relaxed text-slate-600">
            Vercel 환경변수에 <span className="font-mono">TRACKING_PASSWORD</span>를
            8자 이상으로 추가하고 다시 배포하면 이 페이지를 열 수 있습니다.
          </p>
        </Card>
      </TrackingShell>
    );
  }

  if (!(await hasTrackingAccess())) {
    return (
      <TrackingShell>
        <Card className="mx-auto w-full max-w-md space-y-4">
          <div>
            <CardTitle>트래킹 관리자</CardTitle>
            <p className="mt-2 text-sm text-slate-600">
              방문 기록을 보려면 관리자 비밀번호를 입력해주세요.
            </p>
          </div>
          {params.error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              비밀번호가 맞지 않습니다.
            </p>
          )}
          <form action={loginTracking} className="space-y-3">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className="h-12 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-2 focus:border-brand-400"
              placeholder="비밀번호"
            />
            <button
              type="submit"
              className="h-12 w-full rounded-xl bg-brand-600 text-sm font-bold text-white transition-opacity hover:opacity-90"
            >
              보기
            </button>
          </form>
        </Card>
      </TrackingShell>
    );
  }

  let summary: TrackingSummary;
  try {
    summary = await fetchTrackingSummary();
  } catch (error) {
    console.error("[tracking] failed to load dashboard", error);
    return (
      <TrackingShell>
        <Card className="space-y-3">
          <CardTitle>트래킹 데이터를 불러오지 못했습니다</CardTitle>
          <p className="text-sm leading-relaxed text-slate-600">
            Supabase에 <span className="font-mono">tracking_events</span> 테이블이
            만들어졌는지 확인해주세요. 최신 <span className="font-mono">supabase/schema.sql</span>
            을 SQL Editor에서 다시 실행하면 됩니다.
          </p>
        </Card>
      </TrackingShell>
    );
  }

  return (
    <TrackingShell>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">관리자 화면</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            트래킹 내역
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClearTrackingForm
            action={clearTrackingEventsAction}
            disabled={summary.totalCount === 0}
          />
          <form action={logoutTracking}>
            <button
              type="submit"
              className="h-10 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-200"
            >
              로그아웃
            </button>
          </form>
        </div>
      </div>

      {params.cleared && (
        <p role="status" className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          트래킹 기록을 모두 지웠습니다.
        </p>
      )}
      {params.clearError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          기록을 지우지 못했습니다. 잠시 후 다시 시도해 주세요.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard label="전체 기록" value={summary.totalCount} />
        <MetricCard label="오늘 기록" value={summary.todayCount} />
        <MetricCard label="익명 방문자" value={summary.uniqueVisitorCount} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <CountCard title="페이지별 방문" rows={summary.pageCounts} />
        <CountCard title="기록 종류" rows={summary.eventCounts} />
        <CountCard title="회의별 기록" rows={summary.meetingCounts} emptyText="회의별 기록이 아직 없습니다." />
        <Card className="space-y-3">
          <CardTitle>오늘 시간대별 기록</CardTitle>
          {summary.hourlyCounts.length > 0 ? (
            <div className="space-y-2">
              {summary.hourlyCounts.map((row) => (
                <div key={row.hour} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{row.hour}</span>
                  <span className="font-bold text-slate-900">{row.count.toLocaleString()}회</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">오늘 기록이 아직 없습니다.</p>
          )}
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="mb-3 flex items-center justify-between">
          <CardTitle>최근 기록</CardTitle>
          <p className="text-xs font-medium text-slate-400">최근 50건</p>
        </div>
        <RecentEventsTable events={summary.recentEvents} />
      </Card>
    </TrackingShell>
  );
}

function TrackingShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-white/95">
      <SiteHeader mobileLogo />
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 sm:px-6">{children}</main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="space-y-2">
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="text-3xl font-extrabold tabular-nums text-slate-900">
        {value.toLocaleString()}
      </p>
    </Card>
  );
}

function CountCard({
  title,
  rows,
  emptyText = "아직 기록이 없습니다.",
}: {
  title: string;
  rows: TrackingCountRow[];
  emptyText?: string;
}) {
  return (
    <Card className="space-y-3">
      <CardTitle>{title}</CardTitle>
      {rows.length > 0 ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={`${row.key}-${row.label}`} className="flex items-start justify-between gap-4 text-sm">
              <div className="min-w-0">
                <p className="font-bold text-slate-800">{row.label}</p>
                <p className="truncate text-xs text-slate-400">{row.key}</p>
              </div>
              <span className="shrink-0 font-extrabold tabular-nums text-slate-900">
                {row.count.toLocaleString()}회
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">{emptyText}</p>
      )}
    </Card>
  );
}

function RecentEventsTable({ events }: { events: TrackingEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">최근 기록이 아직 없습니다.</p>;
  }

  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-y border-slate-100 bg-slate-50 text-xs font-bold text-slate-500">
            <th className="px-5 py-3 sm:px-6">시간</th>
            <th className="px-5 py-3 sm:px-6">화면</th>
            <th className="px-5 py-3 sm:px-6">종류</th>
            <th className="px-5 py-3 sm:px-6">기기</th>
            <th className="px-5 py-3 sm:px-6">회의 ID</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id} className="border-b border-slate-100">
              <td className="px-5 py-3 font-medium text-slate-700 sm:px-6">
                {formatKstDateTime(event.createdAt)}
              </td>
              <td className="px-5 py-3 sm:px-6">
                <p className="font-bold text-slate-900">{event.pageLabel}</p>
                <p className="text-xs text-slate-400">{event.pagePath}</p>
              </td>
              <td className="px-5 py-3 text-slate-600 sm:px-6">
                {event.eventName === "screen_view" ? "화면 진입" : "주소 방문"}
              </td>
              <td className="px-5 py-3 text-slate-600 sm:px-6">{event.deviceType}</td>
              <td className="px-5 py-3 font-mono text-xs text-slate-500 sm:px-6">
                {event.meetingId ?? "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatKstDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}
