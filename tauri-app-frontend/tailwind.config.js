/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Linear-style dark theme
        bg: {
          primary: '#0a0a0b',
          secondary: '#111113',
          tertiary: '#18181b',
          elevated: '#1c1c1f',
          hover: '#232326',
          active: '#2a2a2e',
        },
        border: {
          DEFAULT: '#2a2a2e',
          subtle: '#1f1f23',
          strong: '#3a3a3e',
        },
        text: {
          primary: '#f5f5f5',
          secondary: '#a0a0a8',
          tertiary: '#6b6b73',
          disabled: '#4a4a52',
        },
        accent: {
          DEFAULT: '#5e6ad2',
          hover: '#7b84e0',
          muted: '#5e6ad220',
          strong: '#4a54b8',
        },
        success: {
          DEFAULT: '#3ecf8e',
          muted: '#3ecf8e20',
        },
        warning: {
          DEFAULT: '#f5a623',
          muted: '#f5a62320',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: '#ef444420',
        },
        info: {
          DEFAULT: '#3b82f6',
          muted: '#3b82f620',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xs': ['11px', '16px'],
        'sm': ['12px', '18px'],
        'base': ['13px', '20px'],
        'lg': ['15px', '22px'],
        'xl': ['17px', '25px'],
        '2xl': ['20px', '28px'],
        '3xl': ['24px', '32px'],
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '12px',
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-in': 'slideIn 0.15s ease-out',
        'slide-up': 'slideUp 0.15s ease-out',
        'scale-in': 'scaleIn 0.1s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
