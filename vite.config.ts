import { defineConfig } from "vite";

export default defineConfig({
  base: "/mkident/",
  build: {
    target: "es2020",
  },
  server: {
    port: 5173,
  },
});
