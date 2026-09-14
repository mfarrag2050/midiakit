import type { Config } from 'tailwindcss';
import preset from '@pf-mediakit/ui/tailwind-preset';

// نظام التصميم يعيش في @pf-mediakit/ui (preset يحمل الألوان/الخطوط/
// الحواف). القيم الفعلية (--bg, --accent…) في tokens.css المُستورَد
// من globals.css. `content` يمسح تطبيقنا **و** حزم packages/ui و
// packages/i18n كي لا تُقلَّم أصناف Tailwind من داخلها.
const config: Config = {
  presets: [preset],
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
    '../../packages/i18n/src/**/*.{ts,tsx}',
  ],
  plugins: [],
};

export default config;
