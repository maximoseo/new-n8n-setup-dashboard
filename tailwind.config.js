/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        slate: "#475569",
        paper: "#f7f8fb",
        line: "#d9dee8",
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
