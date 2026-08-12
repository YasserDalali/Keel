/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    borderRadius: {
      none: "0px",
      sm: "0px",
      DEFAULT: "0px",
      md: "0px",
      lg: "0px",
      xl: "0px",
      "2xl": "0px",
      "3xl": "0px",
      full: "0px",
    },
    extend: {
      colors: {
        paper: "#F4F4F0",
        "paper-2": "#EAE8E3",
        ink: "#111111",
        hazard: "#E61919",
      },
      fontFamily: {
        display: ['"Archivo Black"', "sans-serif"],
        mono: ['"IBM Plex Mono"', "monospace"],
        sans: ["Inter", "sans-serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        wide2: "0.08em",
      },
    },
  },
  plugins: [],
};
