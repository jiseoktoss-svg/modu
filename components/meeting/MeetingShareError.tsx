import Link from "next/link";

export function MeetingShareError() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-16 text-center">
      <div className="w-full rounded-[22px] bg-white p-6 shadow-sm ring-1 ring-slate-100">
        <p className="text-sm font-bold text-brand-600">앗, 문제가 생겼어요</p>
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">
          일정 링크를 불러오지 못했어요
        </h1>
        <p className="mt-3 break-keep text-sm font-medium leading-6 text-slate-500">
          일정은 저장했지만 링크 화면을 여는 중에 서버에 연결하지 못했어요.
          잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Link
            href="/meetings/new"
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-100 px-5 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            새 일정 만들기
          </Link>
          <a
            href=""
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-brand-500 px-5 text-sm font-bold text-white shadow-sm shadow-brand-500/20 transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            다시 시도
          </a>
        </div>
      </div>
    </section>
  );
}
