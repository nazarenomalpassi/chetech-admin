import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7f7f3",
          100: "#efefea",
          200: "#e0dfd8",
          300: "#c7c5bd",
          400: "#a6a39a",
          500: "#7d7a72",
          600: "#5f5c55",
          700: "#45433e",
          800: "#2f2d2a",
          900: "#1c1b19"
        },
        graphite: "#1c1b19",
        fog: "#7b7a74",
        ink: "#141413",
        canvas: "#f5f6f5",
        line: "#dfe3e0",
        finance: {
          profit: "#11795a",
          profitSoft: "#ebf8f2",
          expense: "#c14141",
          expenseSoft: "#fdf1f1",
          caution: "#88600f",
          cautionSoft: "#fcf6e7"
        }
      },
      boxShadow: {
        soft: "0 2px 8px rgba(20, 20, 19, 0.04)",
        panel: "0 1px 2px rgba(20, 20, 19, 0.025)",
        pop: "0 12px 36px rgba(20, 20, 19, 0.12)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"],
        brand: ["var(--font-brand)", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
