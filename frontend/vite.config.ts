import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5280, // local dev port (5173 is used by another local project)
    proxy: {
      "/api": { target: "http://127.0.0.1:8200", changeOrigin: true },
    },
  },
});
