import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    proxy: {
      "/gemai/v1beta": {
        target: "https://api.gemai.cc/v1beta",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gemai\/v1beta/, ""),
      },
      "/gemai/v1": {
        target: "https://api.gemai.cc/v1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gemai\/v1/, ""),
      },
    },
  },
});
