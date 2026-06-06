import path from "path";

import { fileURLToPath } from "url";

import { defineConfig } from "vite";

import {
  sendMarketContextDebugJson,
  sendMarketContextJson,
} from "./lib/market-context-api.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));



/** Serve /api/market-context during `vite` dev (no Express required for this route). */

function marketContextDevApi() {

  return {

    name: "market-context-dev-api",

    configureServer(server) {

      server.middlewares.use((req, res, next) => {

        const url = req.url?.split("?")[0];

        const isMarketContext = url === "/api/market-context";

        const isMarketContextDebug = url === "/api/market-context/debug";

        if (!isMarketContext && !isMarketContextDebug) {

          next();

          return;

        }

        if (req.method === "OPTIONS") {

          res.setHeader("Access-Control-Allow-Origin", "*");

          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

          res.statusCode = 200;

          res.end();

          return;

        }

        if (req.method !== "GET") {

          res.statusCode = 405;

          res.end(JSON.stringify({ error: "Method not allowed" }));

          return;

        }

        const query = Object.fromEntries(
          new URL(req.url ?? "/", "http://localhost").searchParams
        );

        void (isMarketContextDebug

          ? sendMarketContextDebugJson(res)

          : sendMarketContextJson({ query }, res));

      });

    },

  };

}



export default defineConfig({

  root: path.resolve(__dirname, "public"),

  envDir: __dirname,

  publicDir: false,

  plugins: [marketContextDevApi()],

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

      "/api/rss": {

        target: "https://feeds.finance.yahoo.com",

        changeOrigin: true,

        rewrite: (path) => path.replace(/^\/api\/rss/, ""),

      },

      "/api/market-context": {

        target: "http://localhost:3001",

        changeOrigin: true,

      },

      "/api/market-context/debug": {

        target: "http://localhost:3001",

        changeOrigin: true,

      },

      "/api": "http://localhost:3001",

    },

  },

});


