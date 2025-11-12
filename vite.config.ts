import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST || "0.0.0.0";

// add *multiple* allowed hosts if needed
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    host,
    port: 1420,
    strictPort: true,
    allowedHosts: [
      "35f3002e4a31.ngrok-free.app",  // 👈 your ngrok URL
      "4339af104094.ngrok-free.app",  // 👈 optional second one
      ".ngrok-free.app",              // 👈 wildcard for all ngrok tunnels
      "localhost",
      "0.0.0.0"
    ],
    hmr: {
      protocol: "ws",
      host,
      port: 1421
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
