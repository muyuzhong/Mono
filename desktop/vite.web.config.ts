import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
