import { fetchTrackingSummary } from "@/lib/tracking";
import {
  canBypassTrackingAuthLocally,
  hasTrackingAccess,
  hasTrackingPassword,
} from "@/lib/trackingAuth";
import type {
  TrackingCountRow,
  TrackingDropOffRow,
  TrackingEvent,
  TrackingFunnelStep,
  TrackingSummary,
} from "@/lib/trackingModel";
import type { ReactNode } from "react";
import { ClearTrackingForm } from "./ClearTrackingForm";
import { TrackingNotice } from "./TrackingNotice";
import { clearTrackingEventsAction, loginTracking, logoutTracking } from "./actions";

export const dynamic = "force-dynamic";

const TERMINAL_PANEL_SCROLL_CSS = `
.modu-terminal-panel-scroll {
  scrollbar-width: thin;
  scrollbar-color: #71717a #09090b;
}
.modu-terminal-panel-scroll::-webkit-scrollbar {
  width: 8px;
}
.modu-terminal-panel-scroll::-webkit-scrollbar-track {
  background:
    repeating-linear-gradient(
      0deg,
      rgba(113, 113, 122, 0.12) 0,
      rgba(113, 113, 122, 0.12) 1px,
      transparent 1px,
      transparent 6px
    ),
    #09090b;
  border-left: 1px solid #27272a;
}
.modu-terminal-panel-scroll::-webkit-scrollbar-thumb {
  background: #71717a;
  border: 2px solid #09090b;
}
.modu-terminal-panel-scroll::-webkit-scrollbar-thumb:hover {
  background: #d4d4d8;
}
`;

export default async function TrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ clearError?: string; cleared?: string; error?: string; setup?: string }>;
}) {
  const params = await searchParams;
  const localAuthBypass = canBypassTrackingAuthLocally();

  if (!hasTrackingPassword() && !localAuthBypass) {
    return (
      <TrackingShell narrow>
        <TerminalPanel title="BOOT.ERROR" meta="ENV_MISSING">
          <TerminalLine prefix="fatal" text="TRACKING_PASSWORD 설정이 필요합니다." tone="danger" />
          <TerminalLine
            prefix="hint"
            text="Vercel 환경변수에 TRACKING_PASSWORD를 8자 이상으로 추가하고 다시 배포해주세요."
          />
        </TerminalPanel>
      </TrackingShell>
    );
  }

  if (!(await hasTrackingAccess())) {
    return (
      <TrackingShell narrow>
        <TerminalPanel title="AUTH.GATE" meta="LOCKED">
          <pre className="mb-5 overflow-hidden text-[10px] leading-tight text-zinc-500 sm:text-xs">
            {String.raw`+--------------------------------+
| MOA TRACKING CONSOLE :: AUTH |
+--------------------------------+`}
          </pre>
          <TerminalLine prefix="login" text="방문 기록을 보려면 관리자 비밀번호를 입력해주세요." />
          {params.error && (
            <p role="alert" className="mt-3 border border-red-400/40 px-3 py-2 text-xs text-red-200">
              [denied] 비밀번호가 맞지 않습니다.
            </p>
          )}
          <form action={loginTracking} className="mt-5 grid gap-3">
            <label className="grid gap-1 text-xs uppercase text-zinc-500">
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                className="h-10 border border-zinc-700 bg-black px-3 font-mono text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-700 focus:border-zinc-200"
                placeholder="********"
              />
            </label>
            <button
              type="submit"
              className="h-10 border border-zinc-300 bg-zinc-100 px-4 font-mono text-xs font-bold uppercase tracking-[0.18em] text-black transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-100 focus:ring-offset-2 focus:ring-offset-black"
            >
              execute login
            </button>
          </form>
        </TerminalPanel>
      </TrackingShell>
    );
  }

  let summary: TrackingSummary;
  try {
    summary = await fetchTrackingSummary();
  } catch (error) {
    console.error("[tracking] failed to load dashboard", error);
    return (
      <TrackingShell narrow>
        <TerminalPanel title="DATA.ERROR" meta="SUPABASE">
          <TerminalLine prefix="fatal" text="트래킹 데이터를 불러오지 못했습니다." tone="danger" />
          <TerminalLine
            prefix="hint"
            text="Supabase에 tracking_events 테이블이 만들어졌는지 확인해주세요."
          />
          <TerminalLine prefix="next" text="최신 supabase/schema.sql을 SQL Editor에서 다시 실행하면 됩니다." />
        </TerminalPanel>
      </TrackingShell>
    );
  }

  return (
    <TrackingShell>
      <TerminalHeader summary={summary} />

      <div className="mb-4 flex flex-col gap-3 border-y border-zinc-800 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-zinc-500">
          <span className="text-zinc-300">root@moa</span>
          <span className="text-zinc-600">:</span>
          <span>/tracking</span>
          <span className="ml-2 text-zinc-700">$</span>
          <span className="ml-2 text-zinc-300">render --mode=text-dashboard</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <ClearTrackingForm
            action={clearTrackingEventsAction}
            disabled={summary.totalCount === 0}
          />
          <form action={logoutTracking}>
            <button
              type="submit"
              className="h-8 border border-zinc-700 bg-black px-3 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-zinc-300 hover:text-white focus:outline-none focus:ring-2 focus:ring-zinc-200 focus:ring-offset-2 focus:ring-offset-black"
            >
              logout
            </button>
          </form>
        </div>
      </div>

      {params.cleared && (
        <TrackingNotice tone="success" text="트래킹 기록을 모두 지웠습니다." />
      )}
      {params.clearError && (
        <TrackingNotice tone="danger" text="기록을 지우지 못했습니다. 잠시 후 다시 시도해 주세요." />
      )}

      <section className="grid gap-px border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCell label="TOTAL_EVENTS" value={summary.totalCount} />
        <MetricCell label="VISITORS_TODAY" value={summary.todayUniqueVisitorCount} />
        <MetricCell label="UNIQUE_IPS_ALL" value={summary.uniqueVisitorCount} />
        <MetricCell label="MEETING_REACH" value={formatPercent(summary.meetingCreationRate)} />
      </section>

      <div className="mt-4 grid gap-4 2xl:grid-cols-2">
        <FunnelPanel title="FUNNEL.MEETING_CREATE" steps={summary.meetingCreationFunnel} />
        <FunnelPanel title="FUNNEL.RESPONSE_FLOW" steps={summary.responseFunnel} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <DropOffPanel rows={summary.dropOffRows} />
        <CountPanel
          title="DEVICE.USERS"
          rows={summary.deviceVisitorCounts}
          emptyText="방문자 기록이 아직 없습니다."
          unit="명"
        />
        <CountPanel
          title="SOURCE.FIRST_TOUCH"
          rows={summary.trafficSourceCounts}
          emptyText="유입 기록이 아직 없습니다."
          unit="명"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <CountPanel title="PAGE.HITS" rows={summary.pageCounts} />
        <CountPanel title="EVENT.TYPES" rows={summary.eventCounts} />
        <CountPanel
          title="MEETING.HITS"
          rows={summary.meetingCounts}
          emptyText="회의별 기록이 아직 없습니다."
        />
        <HourlyPanel rows={summary.hourlyCounts} />
      </div>

      <RecentEventsPanel events={summary.recentEvents} />
    </TrackingShell>
  );
}

function TrackingShell({
  children,
  narrow = false,
}: {
  children: ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-black font-mono text-zinc-200 selection:bg-zinc-100 selection:text-black">
      <style>{TERMINAL_PANEL_SCROLL_CSS}</style>
      <div className="min-h-dvh bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:18px_18px]">
        <main className={`mx-auto min-w-0 w-full px-3 py-3 sm:px-5 sm:py-5 ${narrow ? "max-w-2xl" : "max-w-[1480px]"}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

function TerminalHeader({ summary }: { summary: TrackingSummary }) {
  return (
    <header className="mb-4 grid gap-4 border border-zinc-800 bg-black/90 p-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <pre className="overflow-hidden text-[10px] leading-tight text-zinc-300 sm:text-xs">
          {String.raw` __  __  ___    _       _____ ____      _    ____ _  _____ _   _  ____
|  \/  |/ _ \  / \     |_   _|  _ \    / \  / ___| |/ /_ _| \ | |/ ___|
| |\/| | | | |/ _ \      | | | |_) |  / _ \| |   | ' / | ||  \| | |  _
| |  | | |_| / ___ \     | | |  _ <  / ___ \ |___| . \ | || |\  | |_| |
|_|  |_|\___/_/   \_\    |_| |_| \_\/_/   \_\____|_|\_\___|_| \_|\____|`}
        </pre>
        <div className="mt-3 grid gap-1 text-xs text-zinc-500 sm:grid-cols-2">
          <TerminalLine prefix="mode" text="retro text-mode analytics console" />
          <TerminalLine prefix="scope" text="admin-only / isolated tracking surface" />
          <TerminalLine prefix="status" text="read-only metrics render" tone="success" />
          <TerminalLine prefix="clock" text={formatKstDateTime(new Date().toISOString())} />
        </div>
      </div>
      <div className="border-t border-zinc-800 pt-3 text-xs lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
        <div className="mb-2 flex items-center justify-between text-zinc-500">
          <span>SYS.SNAPSHOT</span>
          <span>LIVE</span>
        </div>
        <pre className="whitespace-pre-wrap leading-relaxed text-zinc-400">
          {`events     : ${summary.totalCount.toLocaleString()}
today_ips  : ${summary.todayUniqueVisitorCount.toLocaleString()}
all_ips    : ${summary.uniqueVisitorCount.toLocaleString()}
meet_reach : ${formatPercent(summary.meetingCreationRate)}
rows_cache : ${summary.recentEvents.length.toLocaleString()} / 50`}
        </pre>
      </div>
    </header>
  );
}

function TerminalPanel({
  title,
  children,
  meta = "READY",
  className = "",
  bodyClassName = "",
}: {
  title: string;
  children: ReactNode;
  meta?: string;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col overflow-hidden border border-zinc-800 bg-black/90 ${className}`}>
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-zinc-800 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
        <h2 className="min-w-0 break-words text-[12px] font-semibold tracking-[0.12em] text-zinc-200">
          <span className="mr-2 text-zinc-500">::</span>
          {title}
        </h2>
        <span className="shrink-0 text-[10px] font-medium tracking-[0.14em] text-zinc-500">
          {meta}
        </span>
      </div>
      <div className={`modu-terminal-panel-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain p-3 ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

function MetricCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-black p-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-100 sm:text-3xl">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function FunnelPanel({ title, steps }: { title: string; steps: TrackingFunnelStep[] }) {
  return (
    <TerminalPanel title={title} meta="CONVERSION" className="h-[260px] sm:h-[240px]">
      <div className="space-y-2 text-xs">
        {steps.map((step, index) => (
          <div
            key={step.key}
            className="grid gap-2 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0 sm:grid-cols-[32px_minmax(0,1fr)_88px] sm:items-start sm:gap-3"
          >
            <span className="text-zinc-600">{String(index + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-medium text-zinc-200">{step.label}</span>
                <span className="text-zinc-500">
                  start {formatPercent(step.conversionRate)}
                  {step.dropOffCount !== null &&
                    ` / drop ${step.dropOffCount.toLocaleString()}명 ${formatPercent(step.dropOffRate)}`}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full bg-zinc-900">
                <div className="h-full bg-zinc-400" style={{ width: `${barPercent(step.conversionRate)}%` }} />
              </div>
            </div>
            <span className="font-medium tabular-nums text-zinc-100 sm:text-right">
              {step.count.toLocaleString()}명
            </span>
          </div>
        ))}
      </div>
    </TerminalPanel>
  );
}

function DropOffPanel({ rows }: { rows: TrackingDropOffRow[] }) {
  return (
    <TerminalPanel title="DROP.OFF.SUSPECT" meta="TOP_5" className="h-[220px]">
      {rows.length > 0 ? (
        <div className="space-y-2 text-xs">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_84px_64px] gap-3 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
              <span className="min-w-0 truncate font-bold text-zinc-200">{row.label}</span>
              <span className="text-right tabular-nums text-zinc-100">{row.dropOffCount.toLocaleString()}명</span>
              <span className="text-right tabular-nums text-zinc-500">{formatPercent(row.dropOffRate)}</span>
            </div>
          ))}
        </div>
      ) : (
        <TerminalLine prefix="empty" text="이탈로 볼 만한 구간이 아직 없습니다." />
      )}
    </TerminalPanel>
  );
}

function CountPanel({
  title,
  rows,
  emptyText = "아직 기록이 없습니다.",
  unit = "회",
}: {
  title: string;
  rows: TrackingCountRow[];
  emptyText?: string;
  unit?: string;
}) {
  return (
    <TerminalPanel title={title} meta={`${rows.length.toLocaleString()} ROWS`} className="h-[220px]">
      {rows.length > 0 ? (
        <div className="space-y-2 text-xs">
          {rows.map((row) => (
            <div key={`${row.key}-${row.label}`} className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0">
              <div className="min-w-0">
                <p className="truncate font-bold text-zinc-200">{row.label}</p>
                <p className="truncate text-[11px] text-zinc-600">{row.key}</p>
              </div>
              <span className="text-right font-bold tabular-nums text-zinc-100">
                {row.count.toLocaleString()}{unit}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <TerminalLine prefix="empty" text={emptyText} />
      )}
    </TerminalPanel>
  );
}

function HourlyPanel({ rows }: { rows: { hour: string; count: number }[] }) {
  return (
    <TerminalPanel title="TODAY.HOURLY" meta={`${rows.length.toLocaleString()} BUCKETS`} className="h-[220px]">
      {rows.length > 0 ? (
        <div className="space-y-2 text-xs">
          {rows.map((row) => (
            <div key={row.hour} className="grid grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-2 sm:grid-cols-[72px_minmax(0,1fr)_72px] sm:gap-3">
              <span className="text-zinc-500">{row.hour}</span>
              <div className="h-1.5 min-w-0 bg-zinc-900">
                <div className="h-full bg-zinc-500" style={{ width: `${barPercent(row.count * 10)}%` }} />
              </div>
              <span className="text-right font-medium tabular-nums text-zinc-100">{row.count.toLocaleString()}회</span>
            </div>
          ))}
        </div>
      ) : (
        <TerminalLine prefix="empty" text="오늘 기록이 아직 없습니다." />
      )}
    </TerminalPanel>
  );
}

function RecentEventsPanel({ events }: { events: TrackingEvent[] }) {
  return (
    <TerminalPanel title="RECENT.EVENT.LOG" meta="LAST_50" className="mt-4 h-[440px] sm:h-[480px]">
      {events.length === 0 ? (
        <TerminalLine prefix="empty" text="최근 기록이 아직 없습니다." />
      ) : (
        <div className="space-y-2 text-xs">
          <div className="sticky top-0 z-10 hidden grid-cols-[104px_minmax(0,1fr)_92px_72px_120px] gap-3 border-y border-zinc-800 bg-black/95 py-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600 md:grid">
            <span>time</span>
            <span>screen</span>
            <span>event</span>
            <span>device</span>
            <span>meeting_id</span>
          </div>
          {events.map((event) => (
            <div
              key={event.id}
              className="grid min-w-0 gap-1 border-b border-zinc-900 pb-2 last:border-b-0 last:pb-0 hover:bg-zinc-950 md:grid-cols-[104px_minmax(0,1fr)_92px_72px_120px] md:gap-3 md:py-2"
            >
              <span className="font-medium tabular-nums text-zinc-400">
                {formatKstDateTime(event.createdAt)}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-zinc-200 md:truncate">{event.pageLabel}</p>
                <p className="break-all text-[11px] text-zinc-600">{event.pagePath}</p>
              </div>
              <span className="text-zinc-400">
                <span className="text-zinc-600 md:hidden">event: </span>
                {event.eventName === "screen_view" ? "screen_view" : "page_view"}
              </span>
              <span className="text-zinc-400">
                <span className="text-zinc-600 md:hidden">device: </span>
                {event.deviceType}
              </span>
              <span className="min-w-0 break-all text-zinc-500">
                <span className="text-zinc-600 md:hidden">meeting_id: </span>
                {event.meetingId ?? "-"}
              </span>
            </div>
          ))}
        </div>
      )}
    </TerminalPanel>
  );
}

function TerminalLine({
  prefix,
  text,
  tone = "muted",
}: {
  prefix: string;
  text: string;
  tone?: "muted" | "success" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-emerald-200" : tone === "danger" ? "text-red-200" : "text-zinc-300";

  return (
    <p className={`text-xs leading-relaxed ${toneClass}`}>
      <span className="mr-2 text-zinc-600">[{prefix}]</span>
      {text}
    </p>
  );
}

function barPercent(value: number | null) {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, value));
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

function formatPercent(value: number | null) {
  if (value === null) return "-";
  return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}%`;
}
