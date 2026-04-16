import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createReadStream, existsSync, statSync } from "node:fs";
import { cp } from "node:fs/promises";

const petsDir = path.resolve(__dirname, "pets");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json",
  ".md": "text/markdown",
};

export default defineConfig(async () => {
  const host = process.env.TAURI_DEV_HOST;

  return {
    plugins: [
      react(),

      // ── Serve pets/ as static assets ─────────────────────────────────────
      {
        name: "pets-static",

        // Dev: serve every file under pets/ at /pets/<path>
        configureServer(server) {
          server.middlewares.use("/pets", (req, res, next) => {
            const filePath = path.join(
              petsDir,
              decodeURIComponent((req.url ?? "").split("?")[0])
            );
            if (existsSync(filePath) && statSync(filePath).isFile()) {
              const ext = path.extname(filePath).toLowerCase();
              res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
              createReadStream(filePath).pipe(res);
            } else {
              next();
            }
          });
        },

        // Build: copy pets/ → dist/pets/ so Tauri bundles them with the frontend
        async closeBundle() {
          const outDir = path.resolve(__dirname, "dist", "pets");
          await cp(petsDir, outDir, { recursive: true });
        },
      },
    ],

    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? { protocol: "ws", host, port: 1421 }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
