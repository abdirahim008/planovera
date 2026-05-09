import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0B0E14",
          surface: "#12161F",
          raised: "#1A1F2E",
          hover: "#1E2435",
          input: "#0E1219",
        },
        border: {
          DEFAULT: "#232A3B",
          light: "#2E3650",
          focus: "#3B82F6",
        },
        txt: {
          DEFAULT: "#E2E8F4",
          muted: "#7C879E",
          dim: "#4F5872",
        },
        accent: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          soft: "rgba(59,130,246,0.10)",
        },
        ok: { DEFAULT: "#22C55E", soft: "rgba(34,197,94,0.10)" },
        warn: { DEFAULT: "#F59E0B", soft: "rgba(245,158,11,0.10)" },
        err: { DEFAULT: "#EF4444", soft: "rgba(239,68,68,0.10)" },
        header: "#0D7C66",
        subtotal: "#141E2D",
        grandtotal: "#14142B",
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
