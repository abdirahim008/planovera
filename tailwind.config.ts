import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Light (monday.com-style) theme. Page canvas is a soft off-white,
        // cards/panels are pure white, text is dark slate. Kept in lockstep
        // with the --color-* CSS variables in app/globals.css.
        bg: {
          DEFAULT: "#f5f6f8",
          surface: "#ffffff",
          raised: "#ffffff",
          hover: "#eef0f4",
          input: "#f4f5f8",
        },
        border: {
          DEFAULT: "#e3e6ec",
          light: "#eef0f4",
          focus: "#3B82F6",
        },
        txt: {
          DEFAULT: "#1f2734",
          muted: "#5b6577",
          dim: "#7a8499",
        },
        accent: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          soft: "rgba(59,130,246,0.10)",
        },
        ok: { DEFAULT: "#16a34a", soft: "rgba(22,163,74,0.10)" },
        warn: { DEFAULT: "#b45309", soft: "rgba(245,158,11,0.12)" },
        err: { DEFAULT: "#dc2626", soft: "rgba(239,68,68,0.10)" },
        header: "#0D7C66",
        subtotal: "#eef1f6",
        grandtotal: "#e6e9f1",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-in": "slideIn 0.25s ease-out",
      },
      keyframes: {
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          from: { opacity: "0", transform: "translateX(-10px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
