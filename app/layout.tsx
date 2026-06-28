import type { Metadata } from "next";
import { AppProviders } from "@/components/providers/AppProviders";
import "./globals.css";

export const metadata: Metadata = {
  title: "modu — 모두가 납득하는 회의 시간",
  description:
    "여러 사람의 조건을 비교해 모두가 납득할 수 있는 회의 시간을 찾아주는 회의 시간 의사결정 도구.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
