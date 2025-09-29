const palette = {
  ink: '#0B0E11',
  coal: '#14181F',
  accentBlue: '#3A7AFE',
  aqua: '#3DD7FF',
  amber: '#F8C572'
};

module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: palette.ink,
        surface: palette.coal,
        primary: palette.accentBlue,
        accent: palette.aqua,
        warning: palette.amber
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        glow: '0 20px 45px rgba(58, 122, 254, 0.35)'
      }
    }
  },
  plugins: []
};
