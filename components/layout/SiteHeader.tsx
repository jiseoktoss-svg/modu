import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

interface SiteHeaderProps {
  // 모바일에서도 로고를 유지할지(랜딩 전용).
  // 기본은 로고를 숨기고 뒤로가기+타이틀 슬롯을 둔다(MobileHeaderTitle 이 포털로 채움).
  mobileLogo?: boolean;
}

export function SiteHeader({ mobileLogo = false }: SiteHeaderProps) {
  return (
    <>
      <header className="modu-mobile-header fixed inset-x-0 top-0 z-30 bg-white sm:static sm:z-auto sm:bg-white/95">
        <Container className="flex h-14 items-center">
          <Link
            href="/"
            className={cn(
              "text-lg font-extrabold tracking-tight text-brand-600",
              !mobileLogo && "hidden sm:block",
            )}
            aria-label="modu 홈"
          >
            modu
          </Link>
          {!mobileLogo && (
            <div
              id="modu-mobile-header-slot"
              className="flex min-w-0 flex-1 items-center sm:hidden"
            />
          )}
        </Container>
      </header>
      <div aria-hidden="true" className="h-14 shrink-0 sm:hidden" />
    </>
  );
}
