import {
  buildLiveMarketContext,
  fetchYahooHeadlinesRss,
} from "./market-context-core.js";

const NO_CACHE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  "Access-Control-Allow-Origin": "*",
};

function applyHeaders(res) {
  for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
    res.setHeader(key, value);
  }
}

function sendJson(res, statusCode, body) {
  applyHeaders(res);
  if (typeof res.status === "function") {
    return res.status(statusCode).json(body);
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(body));
}

function logMarketContextResponse(payload, label = "MARKET CONTEXT RESPONSE") {
  console.log(label, JSON.stringify(payload, null, 2));
}

/** Debug payload: market + macro + errors + per-source status (no formattedContext). */
export async function buildMarketContextDebugPayload() {
  const payload = await buildLiveMarketContext();
  return {
    success: payload.success,
    timestamp: payload.timestamp,
    marketData: payload.marketData,
    macroCalendar: payload.macroCalendar,
    macroCalendarStatus: payload.macroCalendarStatus,
    errors: payload.errors,
    calendarErrors: payload.calendarErrors ?? payload.errors?.filter((e) =>
      /^next/.test(e.key ?? "")
    ),
  };
}

function sendXml(res, statusCode, body) {
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (typeof res.status === "function") {
    return res.status(statusCode).send(body);
  }
  res.statusCode = statusCode;
  res.end(body);
}

/** Send market-context JSON (Express, Vite middleware, or Vercel serverless). */
export async function sendMarketContextJson(req, res) {
  const type = req?.query?.type;

  if (type === "headlines") {
    try {
      const symbols = req.query.symbols ?? req.query.s ?? "SPY,QQQ,DIA";
      const text = await fetchYahooHeadlinesRss(symbols);
      return sendXml(res, 200, text);
    } catch (err) {
      console.error("Headlines RSS failed:", err);
      return sendJson(res, 502, {
        error: err.message ?? "Headlines fetch failed",
      });
    }
  }

  try {
    const payload = await buildLiveMarketContext();
    logMarketContextResponse(payload);
    return sendJson(res, 200, payload);
  } catch (err) {
    console.error("Market context failed:", err);
    const failure = {
      success: false,
      timestamp: new Date().toISOString(),
      marketData: { quotes: {}, fearAndGreed: null, errors: [] },
      macroCalendar: {
        nextFOMC: null,
        nextCPI: null,
        nextPPI: null,
        nextNFP: null,
        nextPCE: null,
      },
      macroCalendarStatus: {},
      source: "Yahoo Finance",
      quotes: {},
      errors: [
        {
          key: "market-context",
          ticker: "ALL",
          source: "server",
          message: err.message ?? "Market context failed",
        },
      ],
      formattedContext:
        "LIVE MARKET CONTEXT — retrieval failed completely. Tell Taylor live data and macro calendar could not be loaded from the backend endpoint.",
    };
    logMarketContextResponse(failure, "MARKET CONTEXT RESPONSE (error)");
    return sendJson(res, 500, failure);
  }
}

/** Diagnostics endpoint — full market/macro/errors without formattedContext noise. */
export async function sendMarketContextDebugJson(res) {
  try {
    const payload = await buildMarketContextDebugPayload();
    logMarketContextResponse(payload, "MARKET CONTEXT DEBUG RESPONSE");
    return sendJson(res, 200, payload);
  } catch (err) {
    console.error("Market context debug failed:", err);
    return sendJson(res, 500, {
      success: false,
      timestamp: new Date().toISOString(),
      marketData: null,
      macroCalendar: null,
      macroCalendarStatus: {},
      errors: [
        {
          key: "market-context-debug",
          source: "server",
          message: err.message ?? "Debug build failed",
        },
      ],
    });
  }
}
