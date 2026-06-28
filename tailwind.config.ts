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
      fontFamily: {
        // TossFace(이모지) → Pretendard(본문) 순. TossFace 는 unicode-range 로 이모지에만 적용됨.
        sans: [
          "TossFace",
          '"Pretendard Variable"',
          "Pretendard",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
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
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // 인라인 요소(문장 절)는 transform 이 적용되지 않으므로 opacity 전용.
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // 빈 값 자리표시용 dot 3개 파도타기.
        "dot-wave": {
          "0%, 60%, 100%": { transform: "translateY(0)", opacity: "0.35" },
          "30%": { transform: "translateY(-5px)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.35s ease-out both",
        "fade-in": "fade-in 0.3s ease-out both",
        "dot-wave": "dot-wave 1.1s ease-in-out infinite",
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
