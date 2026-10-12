import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function adminStartupStatusPlugin() {
  return {
    name: "admin-startup-status",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer.address();
        const port = typeof address === "object" && address ? address.port : 5174;
        console.log(`[READY] Admin frontend: http://localhost:${port}`);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [adminStartupStatusPlugin(), tailwindcss(), react()],
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
