import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY ?? "http://localhost:9000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router-dom|zustand)[\\/]/.test(id)) return "vendor";
          if (/[\\/]node_modules[\\/](lucide-react|sonner|@radix-ui[\\/]react-(dialog|dropdown-menu))[\\/]/.test(id)) return "ui";
          if (/[\\/]node_modules[\\/](paper|clipper-lib|imagetracerjs)[\\/]/.test(id)) return "vector";
          return undefined;
        },
      },
    },
  },
});
