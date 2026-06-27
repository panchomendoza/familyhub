import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Proxy API en desarrollo para evitar CORS
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    // Separar chunks por ruta para lazy loading
    rollupOptions: {
      output: {
        manualChunks: {
          react:    ["react", "react-dom"],
          router:   ["react-router-dom"],
          query:    ["@tanstack/react-query"],
          charts:   ["recharts"],
        },
      },
    },
  },
});
