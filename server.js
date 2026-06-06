import cors from "cors";

import dotenv from "dotenv";

import express from "express";

import path from "path";

import { fileURLToPath } from "url";

import generateDocxHandler from "./api/generate-docx.js";

import generateExcelHandler from "./api/generate-excel.js";

import marketBriefHandler from "./api/market-brief.js";

import {
  sendMarketContextDebugJson,
  sendMarketContextJson,
} from "./lib/market-context-api.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));



dotenv.config({ path: path.resolve(__dirname, ".env.local") });



const app = express();

const PORT = 3001;



app.use(cors());

app.use(express.json({ limit: "2mb" }));



app.get("/api/proxy", async (req, res) => {

  const url = req.query.url;

  if (!url || typeof url !== "string") {

    return res.status(400).json({ error: "url query parameter is required" });

  }

  try {

    const proxyRes = await fetch(

      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`

    );

    const data = await proxyRes.json();

    res.status(proxyRes.ok ? 200 : proxyRes.status).json(data);

  } catch (err) {

    console.error("Proxy error:", err);

    res.status(502).json({ error: err.message ?? "Proxy failed" });

  }

});



app.get("/api/market-context", (req, res) => {

  void sendMarketContextJson(req, res);

});

app.get("/api/market-context/debug", (req, res) => {

  void sendMarketContextDebugJson(res);

});

app.options("/api/market-context", (_req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  res.setHeader("Pragma", "no-cache");

  res.status(200).end();

});

app.options("/api/market-context/debug", (_req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  res.setHeader("Pragma", "no-cache");

  res.status(200).end();

});



app.get("/api/market-brief", (req, res) => marketBriefHandler(req, res));

app.post("/api/market-brief", (req, res) => marketBriefHandler(req, res));

app.options("/api/market-brief", (req, res) => marketBriefHandler(req, res));



app.post("/api/generate-excel", (req, res) => generateExcelHandler(req, res));

app.options("/api/generate-excel", (req, res) => generateExcelHandler(req, res));

app.post("/api/generate-docx", (req, res) => generateDocxHandler(req, res));

app.options("/api/generate-docx", (req, res) => generateDocxHandler(req, res));



app.listen(PORT, () => {

  console.log(`File generation server running on http://localhost:${PORT}`);

  console.log(`Market context: http://localhost:${PORT}/api/market-context`);
  console.log(`Market context debug: http://localhost:${PORT}/api/market-context/debug`);

});


