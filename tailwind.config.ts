import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        labBg: "#050505",
        labPanel: "#101010",
        labPanelAlt: "#151515",
        labBorder: "#2a2a2a",
        labText: "#f5f5f5",
        labMuted: "#999999",
        labAccent: "#37a3ff",
        labDanger: "#ff4d4d",
        labWarning: "#ffcc66"
      },
      boxShadow: {
        panel: "0 12px 24px rgba(0, 0, 0, 0.35)"
      }
    }
  },
  plugins: []
};

export default config;
