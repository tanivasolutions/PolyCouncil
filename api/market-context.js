import { fetchYahooHeadlinesRss } from "../lib/market-context-core.js";
import { sendMarketContextJson } from "../lib/market-context-api.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const type = req.query?.type;

  if (type === "headlines") {
    try {
      const symbols = req.query.symbols ?? req.query.s ?? "SPY,QQQ,DIA";
      const text = await fetchYahooHeadlinesRss(symbols);
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      return res.status(200).send(text);
    } catch (err) {
      console.error("Headlines RSS failed:", err);
      return res.status(502).json({
        error: err.message ?? "Headlines fetch failed",
      });
    }
  }

  await sendMarketContextJson(req, res);
}
