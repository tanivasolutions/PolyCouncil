import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import generateDocxHandler from "./api/generate-docx.js";
import generateExcelHandler from "./api/generate-excel.js";

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

app.post("/api/generate-excel", (req, res) => generateExcelHandler(req, res));
app.options("/api/generate-excel", (req, res) => generateExcelHandler(req, res));
app.post("/api/generate-docx", (req, res) => generateDocxHandler(req, res));
app.options("/api/generate-docx", (req, res) => generateDocxHandler(req, res));

app.listen(PORT, () => {
  console.log(`File generation server running on http://localhost:${PORT}`);
});
