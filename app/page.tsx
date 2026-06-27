import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex flex-1 items-center justify-center px-4 py-20">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
            6명의 조건을 비교해,
            <br />
            모두가 납득할 수 있는 1시간을 찾아요.
          </h1>
          <p className="mt-4 text-pretty text-sm text-slate-500">
            필수 참석자 구분 · 선호/불가능 시간 비교 · 후보 투표와 다수결 확정
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <Link href="/meetings/new" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                회의 만들기
                <ArrowRight size={18} />
              </Button>
            </Link>
            <Link href="/sample" className="w-full sm:w-auto">
              <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                샘플 회의 체험하기
              </Button>
            </Link>
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-slate-400">
            <ShieldCheck size={13} />
            상세 일정명은 저장하지 않고, 가능 여부와 선호 상태만 사용해요.
          </p>
        </div>
      </main>
    </div>
  );
}
