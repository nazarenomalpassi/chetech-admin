import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eefaf7",
          100: "#d6f3eb",
          200: "#afe7d7",
          300: "#7dd5bd",
          400: "#48be9e",
          500: "#25a385",
          600: "#19826c",
          700: "#17695a",
          800: "#175349",
          900: "#15453d"
        },
        ink: "#0f172a",
        canvas: "#f7f8f5",
        line: "#dde5df"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(15, 23, 42, 0.08)"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui"]
      }
    }
  },
  plugins: []
};

export default config;
