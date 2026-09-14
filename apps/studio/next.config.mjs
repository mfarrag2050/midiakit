/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // نُشغّل `pnpm typecheck` منفصلاً على apps/studio. باقي الرسم البياني
  // (packages/engine مقفلة على main) قد يحمل ديون نوعية معروفة لا نكسر
  // البناء بسببها.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // S13 preview يستهلك `@pf-mediakit/engine` و `@pf-mediakit/shared` — تُنقل
  // كـsource TS مع imports بـ`.js` (NodeNext). webpack يحتاج transpilePackages
  // لتحليلها.
  transpilePackages: ['@pf-mediakit/engine', '@pf-mediakit/shared'],
  webpack: (config) => {
    // NodeNext-style imports (`./x.js` يشير إلى `./x.ts`) — نُخبر webpack.
    const ext = config.resolve.extensionAlias ?? {};
    ext['.js'] = ['.ts', '.tsx', '.js'];
    ext['.mjs'] = ['.mts', '.mjs'];
    config.resolve.extensionAlias = ext;
    return config;
  },
};

export default nextConfig;
