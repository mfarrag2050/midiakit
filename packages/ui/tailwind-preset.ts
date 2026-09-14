import type { Config } from 'tailwindcss';

// tailwind preset مشترك لنظام تصميم @pf-mediakit/ui.
// **قواعد:**
// - الألوان أسماء دلالية تشير إلى `var(--…)` — القيم في
//   `@pf-mediakit/ui/styles/tokens.css` يستوردها المستهلك من globals.css.
// - المستهلك يبقي `content` الخاص به + مسار الحزمة كي يمسح Tailwind
//   الأصناف الموجودة داخلها.
//
// **مثال في `apps/studio/tailwind.config.ts`:**
//
//   import preset from '@pf-mediakit/ui/tailwind-preset';
//   export default {
//     presets: [preset],
//     content: [
//       './app/**/*.{ts,tsx}',
//       './src/**/*.{ts,tsx}',
//       '../../packages/ui/src/**/*.{ts,tsx}',
//       '../../packages/i18n/src/**/*.{ts,tsx}',
//     ],
//   } satisfies Config;

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        danger: 'var(--danger)',
        success: 'var(--success)',
        warning: 'var(--warning)',
      },
      fontFamily: {
        // العربية أوّلاً (المشروع عربي في جوهره). اللاتينية تتبع.
        sans: [
          'IBM Plex Sans Arabic',
          'Segoe UI',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        latin: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: [
          'IBM Plex Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'monospace',
        ],
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(0,0,0,0.4), 0 0 0 1px var(--border)',
        pop: '0 8px 24px rgba(0,0,0,0.55), 0 0 0 1px var(--border)',
      },
    },
  },
};

export default preset;
