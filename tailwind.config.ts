import type { Config } from "tailwindcss";

/**
 * Design tokens for Verde Field Intel.
 * Palette from the Verde Agrotech logo: lime-green brand (#A4C954), navy (#262250) for the
 * sidebar / dark surfaces, orange accent (#EDA942); segment colors, soft canvas.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      colors: {
        // App canvas
        canvas: "#F3F4EF",
        // Brand lime greens (primary); 900/950 are the Verde navy used for the sidebar gradient
        brand: {
          DEFAULT: "#678722",
          50: "#F3F8E6",
          100: "#E4EFC9",
          150: "#D3E4AB",
          200: "#C2D98D",
          300: "#B3D170",
          400: "#A4C954", // logo lime
          500: "#8CB337",
          600: "#678722", // primary — dark enough for white text
          700: "#516A1B",
          800: "#3E5214",
          900: "#262250", // logo navy
          950: "#17143A",
        },
        // Accent orange (logo dot)
        gold: {
          DEFAULT: "#EDA942",
          dark: "#D4881F",
          50: "#FEF6E9",
          100: "#F8D9A3",
          200: "#F5CE8E",
          600: "#E0921F",
        },
        // Segment / status palette
        seg: {
          high: "#678722",
          medium: "#1565C0",
          low: "#D4881F",
          dormant: "#9E9E9E",
        },
        info: {
          DEFAULT: "#1565C0",
          light: "#42A5F5",
          50: "#E3F2FD",
          600: "#1E88E5",
          900: "#0D47A1",
        },
        purple: {
          DEFAULT: "#7B1FA2",
          light: "#CE93D8",
          dark: "#4527A0",
          50: "#F3E5F5",
          100: "#E1BEE7",
          300: "#9575CD",
          500: "#9C27B0",
          900: "#4A148C",
        },
        orange: {
          DEFAULT: "#E65100",
          light: "#FF8F00",
          50: "#FFF3E0",
        },
        magenta: "#AD1457",
        teal: "#00695C",
        brown: {
          DEFAULT: "#6D4C41",
          light: "#8D6E63",
        },
        steel: "#78909C",
        danger: {
          DEFAULT: "#C62828",
          50: "#FFEBEE",
        },
        ink: {
          DEFAULT: "#1A1C1A",
          soft: "#5A6B5A",
          700: "#424242",
          600: "#616161",
          500: "#757575",
          muted: "#9E9E9E",
          400: "#BDBDBD",
        },
        surface: {
          50: "#FAFAFA",
          100: "#F8F8F8",
          150: "#F5F5F5",
          200: "#F0F0F0",
          300: "#EEEEEE",
          400: "#E8E8E8",
        },
        line: {
          DEFAULT: "#E0E0E0",
          warm: "#E6E8E4",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        sidebar: "2px 0 20px rgba(0,0,0,0.15)",
        modal: "0 20px 60px rgba(0,0,0,0.25)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        fadeUp: "fadeUp 0.4s ease both",
        countUp: "countUp 0.6s ease both",
      },
    },
  },
  plugins: [],
};

export default config;
