/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#07111f",
          900: "#0b1a2e",
          800: "#12243d",
          700: "#1a3254",
        },
        accent: "#3b82f6",
        ok: "#22c55e",
        caution: "#f59e0b",
        urgent: "#ef4444",
      },
      fontFamily: {
        sans: ["Source Sans 3", "Segoe UI", "system-ui", "sans-serif"],
        display: ["Outfit", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
