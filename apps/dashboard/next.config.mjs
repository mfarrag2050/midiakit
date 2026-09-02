/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // نحن نُشغّل `pnpm typecheck` منفصلاً على apps/dashboard.
  // Next يتفقّد كل الرسم البياني بما فيه packages/engine (مقفلة على main
  // ولها أخطاء نوعية معروفة، docs/11). لا نكسر البناء بسببها.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // نسمح لـNext باستيراد الحزم من workspace بلا bundling
  transpilePackages: ['@pf-mediakit/renderer'],
  experimental: {
    serverComponentsExternalPackages: ['bullmq', 'ioredis', 'skia-canvas'],
  },
  webpack: (config) => {
    // مصادر renderer تستعمل import '.foo.js' مع ملفات .ts (ESM TS convention).
    // نُعلم webpack بأن `.js` قد يحل إلى `.ts`.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
