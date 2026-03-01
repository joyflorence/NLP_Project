import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  server: {
    // proxy to the backend during development.  The target can be overridden via
    // the VITE_API_BASE_URL (without the "/api" suffix) so that CI or alternate
    // backends can be used without editing this file.
    proxy: {
      "/api": {
        target: import.meta.env.VITE_API_BASE_URL
          ? import.meta.env.VITE_API_BASE_URL.replace(/\/api$/, "")
          : "http://localhost:8000",
        changeOrigin: true,
        // keep the /api prefix so our client code remains unchanged
        rewrite: (path) => path
      }
    }
  }
});
