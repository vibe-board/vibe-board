import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'var(--surface)',
        'surface-raised': 'var(--surface-raised)',
        'surface-overlay': 'var(--surface-overlay)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        accent: 'var(--accent)',
        'accent-muted': 'var(--accent-muted)',
        'status-todo': 'var(--status-todo)',
        'status-inprogress': 'var(--status-inprogress)',
        'status-inreview': 'var(--status-inreview)',
        'status-done': 'var(--status-done)',
        'status-cancelled': 'var(--status-cancelled)',
        border: 'var(--border)',
        'border-focus': 'var(--border-focus)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['12px', '18px'],
        base: ['14px', '20px'],
        lg: ['16px', '24px'],
        xl: ['18px', '28px'],
        '2xl': ['24px', '32px'],
      },
      borderRadius: {
        DEFAULT: '6px',
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      spacing: {
        sidebar: '240px',
        'sidebar-collapsed': '56px',
      },
    },
  },
  plugins: [],
} satisfies Config;
