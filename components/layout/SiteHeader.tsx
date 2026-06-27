import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <Container className="flex h-14 items-center justify-between">
        <Link
          href="/"
          className="text-lg font-extrabold tracking-tight text-brand-600"
          aria-label="modu 홈"
        >
          modu
        </Link>
        <Link
          href="/sample"
          className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          샘플 회의 체험
        </Link>
      </Container>
    </header>
  );
}
