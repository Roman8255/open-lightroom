/** Lightroom-inspired dark palette */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lr: {
          bg: "#1b1b1b",
          panel: "#2a2a2a",
          panel2: "#323232",
          bar: "#141414",
          border: "#0f0f0f",
          line: "#3d3d3d",
          text: "#c4c4c4",
          dim: "#8a8a8a",
          hi: "#e8e8e8",
          accent: "#4fa3ff",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Helvetica", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
