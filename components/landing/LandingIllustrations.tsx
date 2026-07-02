// 랜딩용 3D 클레이모피즘 느낌 일러스트 (인라인 SVG).
// 톤: 블루가 포인트, 코랄·민트·크림을 보조 색으로 조금씩 섞는다.
// 공통 문법: 부드러운 배경 블롭 + 본체(위가 밝은 그라데이션) + 두께 레이어 +
// 흰 하이라이트 + 바닥의 흐린 그림자 + 떠다니는 작은 구슬.

function ClayFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className="mx-auto h-auto w-full max-w-[320px]"
    >
      {children}
    </svg>
  );
}

// 1) 링크 하나로 초대 — 달력 + 종이비행기
export function InviteClay() {
  return (
    <ClayFrame>
      <defs>
        <linearGradient id="inv-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef6ff" />
          <stop offset="100%" stopColor="#d8eaff" />
        </linearGradient>
        <linearGradient id="inv-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e9f2ff" />
        </linearGradient>
        <linearGradient id="inv-top" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64a8ff" />
          <stop offset="100%" stopColor="#3182f6" />
        </linearGradient>
        <linearGradient id="inv-plane" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd0bd" />
          <stop offset="100%" stopColor="#ff9e7d" />
        </linearGradient>
        <filter id="inv-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <ellipse cx="160" cy="126" rx="134" ry="102" fill="url(#inv-bg)" />
      <ellipse cx="160" cy="206" rx="88" ry="12" fill="#3182f6" opacity="0.14" filter="url(#inv-blur)" />

      {/* 달력: 두께 → 본체 → 상단 바 → 링 */}
      <rect x="88" y="76" width="144" height="118" rx="22" fill="#b7d5ff" />
      <rect x="88" y="70" width="144" height="116" rx="22" fill="url(#inv-body)" />
      <path
        d="M88 92 a22 22 0 0 1 22 -22 h100 a22 22 0 0 1 22 22 v14 h-144 z"
        fill="url(#inv-top)"
      />
      <rect x="112" y="56" width="11" height="26" rx="5.5" fill="#1b64da" />
      <rect x="197" y="56" width="11" height="26" rx="5.5" fill="#1b64da" />

      {/* 날짜 점 + 선택된 하루 */}
      {[0, 1, 2, 3].map((col) => (
        <circle key={`r1-${col}`} cx={112 + col * 26} cy={128} r="5" fill="#c9ddf6" />
      ))}
      {[0, 1].map((col) => (
        <circle key={`r2-${col}`} cx={112 + col * 26} cy={154} r="5" fill="#c9ddf6" />
      ))}
      <rect x="176" y="140" width="34" height="28" rx="10" fill="url(#inv-top)" />
      <path
        d="m184 154 6 6 11 -12"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse cx="118" cy="106" rx="20" ry="7" fill="#ffffff" opacity="0.55" />

      {/* 종이비행기 + 점선 궤적 */}
      <path
        d="M172 52 q30 -24 62 -10"
        fill="none"
        stroke="#8fbcff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="1 9"
      />
      <path d="M238 30 L288 46 L262 56 L255 74 L247 59 L230 52 Z" fill="url(#inv-plane)" />
      <path d="M262 56 L255 74 L252 58 Z" fill="#f27e57" />

      {/* 떠다니는 구슬 */}
      <circle cx="52" cy="86" r="10" fill="#a9e8cc" />
      <circle cx="49" cy="83" r="3.5" fill="#ffffff" opacity="0.7" />
      <circle cx="272" cy="150" r="8" fill="#ffe3a8" />
      <circle cx="270" cy="148" r="2.6" fill="#ffffff" opacity="0.8" />
    </ClayFrame>
  );
}

// 2) 어려운 시간만 알려주기 — 시계 + 말풍선
export function TimeClay() {
  return (
    <ClayFrame>
      <defs>
        <linearGradient id="time-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e9f7f1" />
          <stop offset="100%" stopColor="#d8eaff" />
        </linearGradient>
        <linearGradient id="time-ring" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a5c9ff" />
          <stop offset="100%" stopColor="#64a8ff" />
        </linearGradient>
        <linearGradient id="time-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#eaf2ff" />
        </linearGradient>
        <linearGradient id="time-bubble" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff4dd" />
          <stop offset="100%" stopColor="#ffe3a8" />
        </linearGradient>
        <filter id="time-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <ellipse cx="160" cy="128" rx="134" ry="102" fill="url(#time-bg)" />
      <ellipse cx="152" cy="208" rx="84" ry="12" fill="#3182f6" opacity="0.14" filter="url(#time-blur)" />

      {/* 시계: 두께 → 링 → 판 */}
      <circle cx="148" cy="130" r="62" fill="#5f96e8" />
      <circle cx="148" cy="126" r="62" fill="url(#time-ring)" />
      <circle cx="148" cy="126" r="47" fill="url(#time-face)" />
      {[0, 90, 180, 270].map((deg) => (
        <circle
          key={deg}
          cx={148 + 38 * Math.cos((deg * Math.PI) / 180)}
          cy={126 + 38 * Math.sin((deg * Math.PI) / 180)}
          r="3.4"
          fill="#bcd5f5"
        />
      ))}
      <path d="M148 126 V98" stroke="#1b64da" strokeWidth="9" strokeLinecap="round" />
      <path d="M148 126 L170 140" stroke="#ff9e7d" strokeWidth="8" strokeLinecap="round" />
      <circle cx="148" cy="126" r="7" fill="#1b64da" />
      <circle cx="146" cy="124" r="2.4" fill="#ffffff" opacity="0.7" />
      <ellipse cx="122" cy="92" rx="16" ry="7" fill="#ffffff" opacity="0.55" />

      {/* 말풍선: 안 되는 시간을 살짝 알려주는 느낌(점 3개) */}
      <path
        d="M212 58 h64 a16 16 0 0 1 16 16 v22 a16 16 0 0 1 -16 16 h-38 l-14 14 v-14 h-12 a16 16 0 0 1 -16 -16 v-22 a16 16 0 0 1 16 -16 z"
        fill="url(#time-bubble)"
      />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={230 + i * 15} cy={85} r="4.4" fill="#3182f6" />
      ))}

      {/* 떠다니는 구슬 */}
      <circle cx="56" cy="170" r="9" fill="#c9e2ff" />
      <circle cx="53" cy="167" r="3" fill="#ffffff" opacity="0.8" />
      <circle cx="252" cy="176" r="7" fill="#ffc9b5" />
      <circle cx="250" cy="174" r="2.2" fill="#ffffff" opacity="0.8" />
    </ClayFrame>
  );
}

// 3) 함께 골라서 확정 — 투표 카드 + 체크 배지
export function ConfirmClay() {
  return (
    <ClayFrame>
      <defs>
        <linearGradient id="cf-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#eef6ff" />
          <stop offset="100%" stopColor="#dde9ff" />
        </linearGradient>
        <linearGradient id="cf-card" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ecf3ff" />
        </linearGradient>
        <linearGradient id="cf-badge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#64a8ff" />
          <stop offset="100%" stopColor="#2272eb" />
        </linearGradient>
        <filter id="cf-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>

      <ellipse cx="160" cy="126" rx="134" ry="102" fill="url(#cf-bg)" />
      <ellipse cx="160" cy="206" rx="88" ry="12" fill="#3182f6" opacity="0.14" filter="url(#cf-blur)" />

      {/* 카드 더미: 뒤(기울임) → 앞 */}
      <rect x="84" y="64" width="140" height="112" rx="20" fill="#bcd8ff" transform="rotate(-7 154 120)" />
      <rect x="92" y="62" width="140" height="116" rx="20" fill="#9ec6ff" />
      <rect x="92" y="56" width="140" height="116" rx="20" fill="url(#cf-card)" />

      {/* 후보 줄: 위 두 줄은 회색, 세 번째 줄이 뽑힌 시간 */}
      <rect x="110" y="76" width="86" height="12" rx="6" fill="#dbe7f7" />
      <rect x="110" y="98" width="104" height="12" rx="6" fill="#dbe7f7" />
      <rect x="110" y="120" width="104" height="22" rx="11" fill="url(#cf-badge)" />
      <circle cx="123" cy="131" r="5" fill="#ffffff" opacity="0.9" />
      <rect x="134" y="127" width="60" height="8" rx="4" fill="#ffffff" opacity="0.75" />
      <ellipse cx="122" cy="70" rx="18" ry="6" fill="#ffffff" opacity="0.55" />

      {/* 체크 배지 */}
      <circle cx="228" cy="160" r="37" fill="#1d5fc4" />
      <circle cx="228" cy="156" r="37" fill="url(#cf-badge)" />
      <path
        d="m211 156 12 12 22 -24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <ellipse cx="214" cy="138" rx="12" ry="5" fill="#ffffff" opacity="0.45" />

      {/* 콘페티 */}
      <circle cx="62" cy="90" r="7" fill="#ffc9b5" />
      <circle cx="60" cy="88" r="2.2" fill="#ffffff" opacity="0.8" />
      <circle cx="270" cy="86" r="9" fill="#a9e8cc" />
      <circle cx="267" cy="83" r="3" fill="#ffffff" opacity="0.7" />
      <rect x="70" y="176" width="12" height="12" rx="4" fill="#ffe3a8" transform="rotate(18 76 182)" />
    </ClayFrame>
  );
}
