import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    // lib/statusStyles.ts 등에 Tailwind 클래스 문자열이 있어 함께 스캔한다.
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#e8f3ff",
          100: "#c9e2ff",
          200: "#90c2ff",
          300: "#64a8ff",
          400: "#4593fc",
          500: "#3182f6",
          600: "#2272eb",
          700: "#1b64da",
          800: "#1957c2",
          900: "#194aa0",
        },
        // 상태 색상 — 색상에만 의존하지 않도록 항상 텍스트 라벨과 함께 사용한다.
        status: {
          available: "#16a34a",
          busy: "#dc2626",
          avoid: "#d97706",
          preferred: "#2563eb",
          pending: "#6b7280",
        },
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
