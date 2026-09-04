/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // نُشغّل `pnpm typecheck` منفصلاً على apps/studio. باقي الرسم البياني
  // (packages/engine مقفلة على main) قد يحمل ديون نوعية معروفة لا نكسر
  // البناء بسببها.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
