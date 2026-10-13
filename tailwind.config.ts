import { heroui } from "@heroui/react";
import type { Config } from "tailwindcss";

// Scale derived from the logo's blue (#4068E0).
const brand = {
  50: "#eef2ff",
  100: "#dfe7ff",
  200: "#c3d0ff",
  300: "#9db1fb",
  400: "#6f88f0",
  500: "#4068e0",
  600: "#3350c4",
  700: "#2b41a0",
  800: "#283a80",
  900: "#253366",
  DEFAULT: "#4068e0",
  foreground: "#ffffff",
};

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    heroui({
      themes: {
        light: {
          colors: {
            background: "#f4f6fc",
            foreground: "#0f172a",
            content1: "#ffffff",
            primary: brand,
          },
        },
        dark: {
          colors: {
            background: "#070a14",
            foreground: "#e6e9f5",
            content1: "#111733",
            primary: brand,
          },
        },
      },
    }),
  ],
};

export default config;
