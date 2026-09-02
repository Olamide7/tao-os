/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,html}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter','system-ui','sans-serif'],
        display: ['Manrope','Inter','system-ui','sans-serif'],
        mono: ['JetBrains Mono','monospace']
      },
      colors: {
        tao: {
          bg: '#0F1012',
          surface: '#16181C',
          raised: '#1C1F24',
          card: '#1C1F24',
          border: '#292D33',
          muted: '#6F746F',
          secondary: '#A7AAA5',
          text: '#F3F4F1',
          accent: '#A8C76A',
          success: '#7FC89A',
          warning: '#D8B56A',
          danger: '#D98282',
          info: '#83AFC9'
        }
      },
      borderRadius: {
        'ctrl': '8px',
        'card': '12px',
        'panel': '16px',
        'dialog': '20px'
      },
      spacing: {
        '4': '4px',
        '8': '8px',
        '12': '12px',
        '16': '16px',
        '24': '24px',
        '32': '32px',
        '48': '48px',
        '64': '64px'
      }
    }
  },
  plugins: []
}
