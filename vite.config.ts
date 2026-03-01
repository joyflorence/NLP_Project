import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // load environment variables for this mode; third argument '' keeps the
  // VITE_ prefix intact so we can reference it directly.
  const env = loadEnv(mode, process.cwd(), "");
  const apiBase = env.VITE_API_BASE_URL
    ? env.VITE_API_BASE_URL.replace(/\/api$/, "")
    : "http://localhost:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      // proxy to the backend during development; target derived from env
      proxy: {
        "/api": {
          target: apiBase,
          changeOrigin: true,
          rewrite: (p) => p,
        },
      },
    },
  };
});
