import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, "public"),
  envDir: __dirname,
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "public/index.html"),
        chat: path.resolve(__dirname, "public/chat.html"),
      },
    },
  },
  resolve: {
    alias: {
      "/src": path.resolve(__dirname, "src"),
      "/documents": path.resolve(__dirname, "documents"),
    },
  },
  server: {
    fs: {
      allow: [__dirname],
    },
    proxy: {
      "/api/proxy": {
        target: "https://api.allorigins.win",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy/, "/get"),
      },
      "/api": "http://localhost:3001",
    },
  },
});
