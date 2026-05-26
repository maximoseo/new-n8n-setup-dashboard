/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        slate: "var(--color-slate)",
        paper: "var(--color-paper)",
        line: "var(--color-line)",
        surface: "var(--color-surface)",
        primary: "#1d4ed8",
        accent: "#0f9f8f"
      },
      boxShadow: {
        shell: "0 24px 70px rgba(15, 23, 42, 0.12)",
        panel: "0 16px 40px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};
