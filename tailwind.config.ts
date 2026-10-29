import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      screens: { "3xl": "1920px", "4xl": "2560px" },
      fontFamily: {
        sans: ['"Leelawadee UI"', '"Noto Sans Thai"', '"Segoe UI"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
