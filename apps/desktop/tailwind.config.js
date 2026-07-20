/** @type {import('tailwindcss').Config} */
const withAlpha = (variable) => `rgb(var(${variable}) / <alpha-value>)`

module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: withAlpha('--color-background'),
          secondary: withAlpha('--color-background-secondary')
        },
        surface: {
          DEFAULT: withAlpha('--color-surface'),
          hover: withAlpha('--color-surface-hover'),
          active: withAlpha('--color-surface-active'),
          muted: withAlpha('--color-surface-muted')
        },
        border: {
          DEFAULT: withAlpha('--color-border'),
          muted: withAlpha('--color-border-muted'),
          subtle: withAlpha('--color-border-subtle')
        },
        accent: {
          DEFAULT: withAlpha('--color-accent'),
          hover: withAlpha('--color-accent-hover'),
          muted: withAlpha('--color-accent-muted')
        },
        text: {
          primary: withAlpha('--color-text-primary'),
          secondary: withAlpha('--color-text-secondary'),
          muted: withAlpha('--color-text-muted')
        },
        success: withAlpha('--color-success'),
        warning: withAlpha('--color-warning'),
        error: withAlpha('--color-error')
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        card: 'var(--shadow-card)'
      },
      borderRadius: {
        '4xl': '1.75rem'
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      }
    }
  },
  plugins: []
}
