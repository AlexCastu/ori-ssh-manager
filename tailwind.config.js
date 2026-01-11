/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark blue palette for glassmorphism
        dark: {
          50: '#e0e7ff',
          100: '#c7d2fe',
          200: '#a5b4fc',
          300: '#818cf8',
          400: '#6366f1',
          500: '#4f46e5',
          600: '#1e2a44', // Main bg light
          700: '#0f1a2b', // Main bg mid
          800: '#0a1421', // Main bg dark
          900: '#0a1421', // Deepest
          950: '#060d15', // Darkest
        },
        // Primary uses vibrant blue
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3B82F6', // Acento hover azul vivo
          600: '#2563eb',
          700: '#1D4ED8', // Botón gradient end
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Accent uses cyan/light blue
        accent: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#63A3FF', // Border accent
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10B981', // Acento éxito
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        // Blue glassmorphism gradients
        'gradient-primary': 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
        'gradient-success': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'gradient-warning': 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
        'gradient-error': 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        'gradient-info': 'linear-gradient(135deg, #3B82F6 0%, #60a5fa 100%)',
        'gradient-dark': 'linear-gradient(135deg, #1e2a44 0%, #0f1a2b 50%, #0a1421 100%)',
        'gradient-main': 'linear-gradient(135deg, #1e2a44 0%, #0f1a2b 50%, #0a1421 100%)',
        'glass': 'linear-gradient(135deg, rgba(15, 31, 55, 0.8) 0%, rgba(10, 20, 33, 0.9) 100%)',
        'glass-card': 'rgba(15, 31, 55, 0.8)',
        'glass-sidebar': 'rgba(10, 20, 33, 0.95)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(102, 126, 234, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(102, 126, 234, 0.6)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
      boxShadow: {
        'glow-sm': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-md': '0 0 30px rgba(59, 130, 246, 0.5)',
        'glow-lg': '0 0 45px rgba(59, 130, 246, 0.6)',
        'glow-success': '0 0 20px rgba(16, 185, 129, 0.5)',
        'inner-glow': 'inset 0 0 25px rgba(59, 130, 246, 0.15)',
        'glass': '0 25px 45px rgba(0, 0, 0, 0.3)',
        'glass-hover': '0 30px 60px rgba(0, 0, 0, 0.4)',
      },
    },
  },
  plugins: [],
}
