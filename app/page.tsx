import Link from "next/link";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <SiteHeader />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 pb-28 sm:pb-20">
        <div className="mx-auto max-w-xl text-center">
          <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
            모두의 시간,
            <br />
            모두의 회의
          </h1>
          <p className="mt-4 text-pretty text-sm text-slate-500">
            회의를 생성하여 참여자들에게 링크를 전달하세요.
          </p>

          {/* 데스크톱: 중앙 CTA */}
          <div className="mt-8 hidden justify-center sm:flex">
            <Link href="/meetings/new">
              <Button size="lg">회의 만들기</Button>
            </Link>
          </div>
        </div>
      </main>

      {/* 모바일: 하단 고정 CTA */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:hidden">
        <Link href="/meetings/new" className="block">
          <Button size="lg" className="w-full">
            회의 만들기
          </Button>
        </Link>
      </div>
    </div>
  );
}
