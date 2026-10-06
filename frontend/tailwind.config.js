/** Lightroom-inspired dark palette */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        lr: {
          bg: "#1e1e1e",
          panel: "#2b2b2b",
          panel2: "#353535",
          bar: "#191919",
          border: "#121212",
          line: "#3d3d3d",
          text: "#c4c4c4",
          dim: "#8a8a8a",
          hi: "#e8e8e8",
          accent: "#5aa0e8",
        },
      },
      fontFamily: { sans: ["Inter", "system-ui", "Helvetica", "Arial", "sans-serif"] },
    },
  },
  plugins: [],
};
