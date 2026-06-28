/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // TDS 배럴 패키지만 트리셰이킹해 dev 컴파일/번들을 줄인다.
    // @emotion/react 는 싱글톤이라야 하므로 일부러 제외(하이드레이션 mismatch 방지),
    // 터보팩도 Emotion SSR 순서를 바꿔 mismatch를 유발하므로 켜지 않는다.
    optimizePackageImports: ["@toss/tds-mobile", "@toss/tds-mobile-ait"],
  },
};

export default nextConfig;
