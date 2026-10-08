/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef9f1",
          100: "#d6f0dd",
          500: "#1f9d55",
          600: "#188043",
          700: "#13642f",
        },
      },
    },
  },
  plugins: [],
};
