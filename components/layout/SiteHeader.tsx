import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function SiteHeader() {
  return (
    <>
      <header className="modu-mobile-header fixed inset-x-0 top-0 z-30 bg-white sm:static sm:z-auto sm:bg-white/95">
        <Container className="flex h-14 items-center">
          <Link
            href="/"
            className="text-lg font-extrabold tracking-tight text-brand-600"
            aria-label="modu 홈"
          >
            modu
          </Link>
        </Container>
      </header>
      <div aria-hidden="true" className="h-14 shrink-0 sm:hidden" />
    </>
  );
}
