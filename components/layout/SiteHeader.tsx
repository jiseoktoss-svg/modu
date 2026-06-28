import Link from "next/link";
import { Container } from "@/components/ui/Container";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white/95">
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
  );
}
