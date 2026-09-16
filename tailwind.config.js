/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        parchment: {
          50: "#FBF4E4",
          100: "#F5E6C8",
          200: "#EAD6A8",
          300: "#D9BE82",
          400: "#C4A25F",
          500: "#A88245",
        },
        ink: {
          50: "#F1EBE3",
          100: "#D8CBBD",
          200: "#9E8B75",
          300: "#6E5A44",
          400: "#4A3828",
          500: "#3E2723",
          600: "#2E1B16",
          700: "#1F110D",
        },
        vermilion: {
          400: "#D6523D",
          500: "#B23A29",
          600: "#8E2A1C",
        },
        bronze: {
          300: "#7A968A",
          400: "#5D7A6F",
          500: "#455F56",
          600: "#334842",
        },
      },
      fontFamily: {
        kai: ['"LXGW WenKai"', '"霞鹜文楷"', '"KaiTi"', '"STKaiti"', 'serif'],
        song: ['"Noto Serif SC"', '"Source Han Serif SC"', '"SimSun"', '"STSong"', 'serif'],
      },
      boxShadow: {
        'scroll': '0 4px 24px -8px rgba(62, 39, 35, 0.25), inset 0 1px 0 rgba(255,255,255,0.5)',
        'seal': '0 2px 8px -2px rgba(178, 58, 41, 0.45)',
        'paper': 'inset 0 0 60px rgba(138, 96, 48, 0.12)',
      },
      backgroundImage: {
        'paper-texture': `radial-gradient(circle at 20% 30%, rgba(138,96,48,0.08) 0%, transparent 50%),
                          radial-gradient(circle at 80% 70%, rgba(138,96,48,0.06) 0%, transparent 50%),
                          radial-gradient(circle at 50% 50%, rgba(62,39,35,0.02) 0%, transparent 70%)`,
      },
      animation: {
        'unroll': 'unroll 0.6s ease-out',
        'fade-up': 'fadeUp 0.4s ease-out both',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'ink-spread': 'inkSpread 0.5s ease-out',
      },
      keyframes: {
        unroll: {
          '0%': { transform: 'scaleY(0)', opacity: '0', transformOrigin: 'top' },
          '100%': { transform: 'scaleY(1)', opacity: '1', transformOrigin: 'top' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(178, 58, 41, 0.4)' },
          '50%': { boxShadow: '0 0 16px 4px rgba(178, 58, 41, 0.25)' },
        },
        inkSpread: {
          '0%': { opacity: '0', transform: 'scale(0.85)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
