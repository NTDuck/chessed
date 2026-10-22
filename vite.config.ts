import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/chessed/",
  plugins: [react()],
  build: {
    target: "es2020",
  },
  server: {
    port: 5173,
  },
});
