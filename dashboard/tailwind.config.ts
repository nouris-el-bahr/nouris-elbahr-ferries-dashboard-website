import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        nouris:            "#3EC0F0",
        "nouris-d":        "#35A5CC",
        "nouris-navy":     "#1F1D3A",
        "nouris-navy-mid": "#2a2850",
      },
      fontFamily: {
        archivo: ["var(--font-archivo)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
