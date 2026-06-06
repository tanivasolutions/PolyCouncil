import {
  readMarketBriefCache,
  runMarketBriefJob,
} from "../lib/market-brief-core.js";

function isAuthorizedTrigger(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const bearer = req.headers.authorization;
  if (bearer === `Bearer ${secret}`) {
    return true;
  }

  return req.headers["x-cron-secret"] === secret;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-cron-secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (req.method === "POST" && !isAuthorizedTrigger(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Browser poll: unauthenticated GET returns the latest cached brief
    if (req.method === "GET" && !isAuthorizedTrigger(req)) {
      const cached = await readMarketBriefCache();
      if (!cached?.success) {
        return res.status(204).end();
      }
      return res.status(200).json(cached);
    }

    const payload = await runMarketBriefJob();
    return res.status(200).json(payload);
  } catch (err) {
    console.error("Market brief failed:", err);
    return res.status(500).json({ error: err.message ?? "Market brief failed" });
  }
}
