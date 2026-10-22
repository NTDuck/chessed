import { defineConfig } from "vite";

export default defineConfig({
  base: "/chessed/",
  build: {
    target: "es2020",
  },
  server: {
    port: 5173,
  },
});
