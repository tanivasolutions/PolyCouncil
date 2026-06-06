// ============================================================
// NEWS FETCHER — pulls headlines and market sentiment
// for the Stocks module Sage agent
// ============================================================

// Try multiple proxies in sequence — allorigins times out on some sources
const PROXIES = [
  (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchWithProxy(url) {
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(url), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      return data.contents ?? data;
    } catch {
      continue;
    }
  }
  return null;
}

// ── Yahoo Finance RSS ─────────────────────────────────────
async function fetchYahooHeadlines() {
  try {
    const xml = await fetchWithProxy(
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY,QQQ,DIA&region=US&lang=en-US"
    );
    if (!xml) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = [...doc.querySelectorAll("item")].slice(0, 10);
    return items.map((item) => ({
      title: item.querySelector("title")?.textContent ?? "",
      description:
        item.querySelector("description")?.textContent?.replace(/<[^>]+>/g, "") ??
        "",
      pubDate: item.querySelector("pubDate")?.textContent ?? "",
      source: "Yahoo Finance",
    }));
  } catch (err) {
    console.warn("Yahoo Finance fetch failed:", err);
    return [];
  }
}

// ── CNN Fear & Greed ──────────────────────────────────────
async function fetchFearAndGreed() {
  try {
    let raw = await fetchWithProxy(
      "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
    );
    if (!raw) return null;

    if (typeof raw === "string") {
      raw = JSON.parse(raw);
    }

    const score = raw?.fear_and_greed?.score;
    const rating = raw?.fear_and_greed?.rating;

    if (score != null) {
      return `Fear & Greed Index: ${Math.round(score)}/100 — ${rating}`;
    }

    return null;
  } catch (err) {
    console.warn("Fear & Greed fetch failed:", err);
    return null;
  }
}

// ── Reuters Business News ─────────────────────────────────
async function fetchReutersHeadlines() {
  try {
    const xml = await fetchWithProxy(
      "https://feeds.reuters.com/reuters/businessNews"
    );
    if (!xml) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = [...doc.querySelectorAll("item")].slice(0, 8);
    return items.map((item) => ({
      title: item.querySelector("title")?.textContent ?? "",
      description:
        item.querySelector("description")?.textContent?.replace(/<[^>]+>/g, "") ??
        "",
      pubDate: item.querySelector("pubDate")?.textContent ?? "",
      source: "Reuters",
    }));
  } catch (err) {
    console.warn("Reuters fetch failed:", err);
    return [];
  }
}

// ── Treasury / rates via Yahoo (^TNX, ^IRX headlines) ─────
async function fetchTreasuryYields() {
  try {
    const xml = await fetchWithProxy(
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5ETNX,%5EIRX&region=US&lang=en-US"
    );
    if (!xml) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = [...doc.querySelectorAll("item")].slice(0, 3);
    const titles = items
      .map((i) => i.querySelector("title")?.textContent ?? "")
      .filter(Boolean);

    if (titles.length) {
      return `Treasury/Rates headlines: ${titles.join(" | ")}`;
    }
    return null;
  } catch (err) {
    console.warn("Treasury yield fetch failed:", err);
    return null;
  }
}

// ── Sector ETF snapshot via Yahoo ─────────────────────────
async function fetchSectorSnapshot() {
  try {
    const xml = await fetchWithProxy(
      "https://feeds.finance.yahoo.com/rss/2.0/headline?s=XLE,XLK,XLV,SOXX&region=US&lang=en-US"
    );
    if (!xml) return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    const items = [...doc.querySelectorAll("item")].slice(0, 6);
    return items.map((item) => ({
      title: item.querySelector("title")?.textContent ?? "",
      description:
        item.querySelector("description")?.textContent?.replace(/<[^>]+>/g, "") ??
        "",
      pubDate: item.querySelector("pubDate")?.textContent ?? "",
      source: "Yahoo Finance — Sectors",
    }));
  } catch (err) {
    console.warn("Sector snapshot fetch failed:", err);
    return [];
  }
}

// ── Assemble full context block ───────────────────────────
export async function fetchMarketContext() {
  const [yahoo, reuters, sectors, fearGreed, yields] = await Promise.all([
    fetchYahooHeadlines(),
    fetchReutersHeadlines(),
    fetchSectorSnapshot(),
    fetchFearAndGreed(),
    fetchTreasuryYields(),
  ]);

  const allHeadlines = [...yahoo, ...reuters, ...sectors]
    .filter((h) => h.title?.trim())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, 18);

  const seen = new Set();
  const deduped = allHeadlines.filter((h) => {
    const key = h.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const headlineText = deduped
    .map(
      (h) =>
        `[${h.source}] ${h.title}${h.description ? ` — ${h.description.slice(0, 100)}` : ""}`
    )
    .join("\n");

  const timestamp = new Date().toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const parts = [`LIVE MARKET CONTEXT — pulled ${timestamp}`, ""];

  if (fearGreed) {
    parts.push(`SENTIMENT: ${fearGreed}`, "");
  } else {
    parts.push("SENTIMENT: Fear & Greed unavailable — infer from headlines", "");
  }

  if (yields) {
    parts.push(`RATES: ${yields}`, "");
  }

  if (headlineText) {
    parts.push("HEADLINES:", headlineText);
  } else {
    parts.push("HEADLINES: Fetch failed — analyze from existing knowledge.");
  }

  return parts.join("\n");
}

// Returns true if the message is asking for a market brief
export function isMarketBriefRequest(text) {
  return /\b(headlines?|brief|news|market (update|check|brief|digest)|swing|what('?s| is) moving|what happened|market today|pull headlines?)\b/i.test(
    text
  );
}
