import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas))",
        ink: "hsl(var(--ink))",
        muted: "hsl(var(--muted))",
        line: "hsl(var(--line))",
        panel: "hsl(var(--panel))",
        "panel-elevated": "hsl(var(--panel-elevated))",
        accent: "hsl(var(--accent))",
        "accent-ink": "hsl(var(--accent-ink))",
        blue: "hsl(var(--blue))",
        amber: "hsl(var(--amber))",
        violet: "hsl(var(--violet))",
      },
      boxShadow: { soft: "0 18px 60px rgba(11, 28, 27, .10)" },
      fontFamily: {
        sans: ["Manrope", "Avenir Next", "Segoe UI", "sans-serif"],
        serif: ["Source Serif 4", "Iowan Old Style", "Georgia", "serif"]
      }
    }
  },
  plugins: []
} satisfies Config;
