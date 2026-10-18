/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Self-hosted (see index.css). Body = Inter, display = Space Grotesk.
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Attention zone palette (kept in sync with src/hooks/useBlinkStats.js)
        zone: {
          hyperfocused: '#3b82f6',
          attentive: '#22c55e',
          neutral: '#eab308',
          fatigued: '#f97316',
          sleepy: '#ef4444',
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(14,165,233,0.25), 0 12px 40px -12px rgba(14,165,233,0.45)',
      },
      keyframes: {
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 0.28s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
