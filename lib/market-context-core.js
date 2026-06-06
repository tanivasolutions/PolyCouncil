import {
  fetchMacroCalendar,
  formatMacroCalendarBlock,
} from "./macro-calendar-core.js";

const FETCH_HEADERS = {
  "User-Agent": "TaylorCommandCenter/1.0 (market-context)",
  Accept: "application/json,text/plain,*/*",
};

const YAHOO_CHART = (symbol) =>
  `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

const YAHOO_RSS_DIRECT = "https://feeds.finance.yahoo.com/rss/2.0/headline";

const YAHOO_RSS = YAHOO_RSS_DIRECT;

const QUOTE_SYMBOLS = {
  SPY: "SPY",
  QQQ: "QQQ",
  VIX: "^VIX",
  TNX: "^TNX",
  DXY: "DX-Y.NYB",
};

async function fetchJson(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseRssItems(xmlText) {
  const items = [];
  const blocks = xmlText.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks.slice(0, 8)) {
    const readTag = (tag) => {
      const m = block.match(
        new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i")
      );
      return decodeHtmlEntities(m?.[1]?.trim() ?? "");
    };
    const title = readTag("title");
    if (!title) continue;
    const description = readTag("description").replace(/<[^>]+>/g, "").trim();
    items.push({
      title,
      description,
      pubDate: readTag("pubDate"),
    });
  }
  return items;
}

async function fetchHeadlines(symbols, label) {
  try {
    const url = `${YAHOO_RSS}?s=${encodeURIComponent(symbols)}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
    const text = await res.text();
    return parseRssItems(text)
      .map((item) => ({
        ...item,
        source: label,
      }))
      .filter((h) => h.title);
  } catch (err) {
    console.warn(`Headlines fetch failed (${label}):`, err.message);
    return [];
  }
}

function formatHeadlines(headlines) {
  if (!headlines.length) return null;

  const seen = new Set();
  const deduped = headlines.filter((h) => {
    const key = h.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped.map((h) => `[${h.source}] ${h.title}`).join("\n");
}

/** Proxy-friendly raw RSS fetch for /api/market-context?type=headlines */
export async function fetchYahooHeadlinesRss(symbols = "SPY,QQQ,DIA") {
  const url = `${YAHOO_RSS_DIRECT}?s=${encodeURIComponent(symbols)}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`RSS HTTP ${res.status}`);
  }
  return res.text();
}

function roundPercent(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(Number(value).toFixed(2));
}

function roundPrice(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Number(Number(value).toFixed(2));
}

async function fetchFearAndGreedData() {
  const data = await fetchJson(
    "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
  );
  const score = data?.fear_and_greed?.score;
  const rating = data?.fear_and_greed?.rating;
  if (score == null) {
    throw new Error("Fear & Greed score missing");
  }
  return {
    score: Math.round(score),
    rating: rating ?? "unknown",
    source: "CNN Fear & Greed Index",
  };
}

async function fetchYahooQuote(yahooSymbol) {
  const json = await fetchJson(YAHOO_CHART(yahooSymbol));
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) {
    throw new Error("Yahoo chart meta missing");
  }
  const price = meta.regularMarketPrice ?? meta.previousClose;
  const previous = meta.chartPreviousClose ?? meta.previousClose;
  const changePercent =
    price != null && previous ? ((price - previous) / previous) * 100 : null;

  return {
    price: roundPrice(price),
    changePercent: roundPercent(changePercent),
  };
}

function stripMacroLabel(slot) {
  if (!slot) return null;
  const { label: _label, sourceStatus: _sourceStatus, ...rest } = slot;
  return rest;
}

function buildMacroCalendarJsonBlock(macroCalendarOut) {
  return `MACRO CALENDAR JSON:\n${JSON.stringify(macroCalendarOut, null, 2)}`;
}

function buildFormattedContext({
  timestamp,
  fearAndGreed,
  quotes,
  marketErrors,
  macroCalendar,
  macroCalendarOut,
  calendarErrors,
  macroCalendarStatus,
  data = {},
}) {
  const lines = [
    `LIVE MARKET CONTEXT — pulled ${timestamp}`,
    "Sources: Yahoo Finance (quotes & headlines), CNN Fear & Greed Index, Federal Reserve, BLS, BEA",
    "",
  ];

  if (fearAndGreed) {
    lines.push(
      `SENTIMENT: Fear & Greed Index: ${fearAndGreed.score}/100 — ${fearAndGreed.rating}`,
      ""
    );
  } else {
    lines.push("SENTIMENT: Fear & Greed unavailable", "");
  }

  const snapshotLines = ["SPY", "QQQ", "VIX", "TNX", "DXY"]
    .map((key) => {
      const q = quotes[key];
      if (!q || q.price == null) return `- ${key}: unavailable`;
      const pct =
        q.changePercent != null
          ? `${q.changePercent >= 0 ? "+" : ""}${q.changePercent}%`
          : "n/a";
      return `- ${key}: ${q.price} (${pct})`;
    })
    .filter(Boolean);

  if (snapshotLines.length) {
    lines.push("MARKET SNAPSHOT:", ...snapshotLines, "");
  }

  const allHeadlines = [
    ...(data.headlines_market ?? []),
    ...(data.headlines_sectors ?? []),
    ...(data.headlines_macro ?? []),
  ].sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const headlineText = formatHeadlines(allHeadlines);

  if (headlineText) {
    lines.push("HEADLINES:", headlineText, "");
  } else {
    lines.push("HEADLINES: unavailable", "");
  }

  const macroBlock = formatMacroCalendarBlock(
    macroCalendar,
    calendarErrors,
    macroCalendarStatus
  );
  lines.push(macroBlock, "", buildMacroCalendarJsonBlock(macroCalendarOut), "");

  if (marketErrors.length) {
    lines.push(
      "PARTIAL DATA — market errors:",
      ...marketErrors.map((e) => `- ${e.ticker ?? e.key}: ${e.message}`),
      ""
    );
  }

  return lines.join("\n").trimEnd();
}

async function runMarketContextTasks() {
  const errors = [];
  const data = {
    quotes: {},
    fearAndGreed: null,
    headlines_market: [],
    headlines_sectors: [],
    headlines_macro: [],
  };

  const tasks = [
    {
      key: "fearAndGreed",
      source: "CNN Fear & Greed Index",
      run: async () => fetchFearAndGreedData(),
    },
    ...Object.entries(QUOTE_SYMBOLS).map(([key, yahooSymbol]) => ({
      key,
      ticker: key,
      source: "Yahoo Finance",
      run: async () => fetchYahooQuote(yahooSymbol),
    })),
    {
      key: "headlines_market",
      source: "Yahoo Finance",
      run: () => fetchHeadlines("SPY,QQQ,DIA", "Market"),
    },
    {
      key: "headlines_sectors",
      source: "Yahoo Finance",
      run: () => fetchHeadlines("XLE,XLK,XLV,SOXX", "Sectors"),
    },
    {
      key: "headlines_macro",
      source: "Yahoo Finance",
      run: () => fetchHeadlines("%5ETNX,%5EVIX,DX-Y.NYB", "Macro"),
    },
  ];

  await Promise.all(
    tasks.map(async (task) => {
      try {
        const result = await task.run();
        if (task.key in QUOTE_SYMBOLS) {
          data.quotes[task.key] = result;
        } else if (task.key === "fearAndGreed") {
          data.fearAndGreed = result;
        } else if (task.key.startsWith("headlines_")) {
          data[task.key] = result;
        }
      } catch (err) {
        errors.push({
          key: task.key.toLowerCase(),
          ticker: task.ticker,
          source: task.source,
          message: err.message ?? "fetch failed",
        });
        if (task.key.startsWith("headlines_")) {
          data[task.key] = [];
        }
      }
    })
  );

  return {
    quotes: data.quotes,
    fearAndGreed: data.fearAndGreed,
    errors,
    data,
  };
}

/**
 * Server-side market snapshot for Sage (Yahoo quotes, CNN Fear & Greed, macro calendar).
 */
export async function buildLiveMarketContext() {
  const timestamp = new Date().toISOString();
  const displayTimestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const [marketResult, calendarResult] = await Promise.all([
    runMarketContextTasks(),
    fetchMacroCalendar(),
  ]);

  const { quotes, fearAndGreed, errors: marketErrors, data } = marketResult;
  const {
    macroCalendar,
    errors: calendarErrors,
    success: calendarSuccess,
    sourceStatus: macroCalendarStatus = {},
  } = calendarResult;

  const hasQuotes = Object.keys(quotes).length > 0;
  const hasHeadlines =
    (data.headlines_market?.length ?? 0) +
      (data.headlines_sectors?.length ?? 0) +
      (data.headlines_macro?.length ?? 0) >
    0;
  const marketSuccess = hasQuotes || fearAndGreed != null || hasHeadlines;
  const success = marketSuccess || calendarSuccess;

  const marketData = {
    timestamp,
    source: "Yahoo Finance",
    quotes,
    fearAndGreed,
    headlines: {
      market: data.headlines_market,
      sectors: data.headlines_sectors,
      macro: data.headlines_macro,
    },
    errors: marketErrors,
  };

  const macroCalendarOut = {
    nextFOMC: stripMacroLabel(macroCalendar.nextFOMC),
    nextCPI: stripMacroLabel(macroCalendar.nextCPI),
    nextPPI: stripMacroLabel(macroCalendar.nextPPI),
    nextNFP: stripMacroLabel(macroCalendar.nextNFP),
    nextPCE: stripMacroLabel(macroCalendar.nextPCE),
  };

  const errors = [...marketErrors, ...calendarErrors];

  const formattedContext = buildFormattedContext({
    timestamp: `${displayTimestamp} CT`,
    fearAndGreed,
    quotes,
    marketErrors,
    macroCalendar,
    macroCalendarOut,
    calendarErrors,
    macroCalendarStatus,
    data,
  });

  return {
    success,
    timestamp,
    marketData,
    macroCalendar: macroCalendarOut,
    macroCalendarStatus,
    calendarErrors,
    formattedContext,
    quotes,
    fearAndGreed,
    errors,
    source: "Yahoo Finance",
  };
}
