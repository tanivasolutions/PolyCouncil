/**
 * Client market context — fetches from /api/market-context (server-side Yahoo/CNN/macro).
 */

export function isMarketBriefRequest(text) {
  return /\b(headlines?|brief|news|market (update|check|brief|digest)|swing|what('?s| is) moving|what happened|market today|pull headlines?|fear and greed|fear & greed|sentiment|greed reading|greed score|greed index|macro calendar|economic calendar|upcoming (cpi|ppi|nfp|pce|fomc|fed)|next (cpi|ppi|nfp|pce|fomc|fed|jobs)|fed meeting|fomc|cpi print|jobs report|nonfarm|payrolls|10y|yield|vix|dxy|dollar index|volatility)\b/i.test(
    text
  );
}

function describeMacroCalendar(macroCalendar) {
  if (macroCalendar === undefined) return "macroCalendar is undefined";
  if (macroCalendar === null) return "macroCalendar is null";
  const keys = ["nextFOMC", "nextCPI", "nextPPI", "nextNFP", "nextPCE"];
  const filled = keys.filter((k) => macroCalendar[k]?.date);
  if (!filled.length) return "macroCalendar is empty (no dated releases)";
  return `macroCalendar has ${filled.length}/5 releases`;
}

export async function buildLiveMarketContext() {
  const res = await fetch("/api/market-context", {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) {
    throw new Error(`Market context HTTP ${res.status}`);
  }
  const response = await res.json();

  console.log("MARKET CONTEXT RESPONSE", JSON.stringify(response, null, 2));
  console.log("MACRO CALENDAR RAW", response.macroCalendar);
  console.log("MACRO CALENDAR CHECK", describeMacroCalendar(response.macroCalendar));

  return response;
}

/**
 * Appended to Sage's system prompt (not stripped by message parsing).
 * Keeps macroCalendar JSON alongside formattedContext.
 */
export function buildSageSystemLiveBlock(marketContext) {
  if (!marketContext?.formattedContext) return null;

  const parts = ["LIVE MARKET CONTEXT", marketContext.formattedContext];

  if (marketContext.macroCalendar) {
    parts.push(
      "",
      "MACRO CALENDAR JSON:",
      JSON.stringify(marketContext.macroCalendar, null, 2)
    );
  }
  if (
    marketContext.macroCalendarStatus &&
    Object.keys(marketContext.macroCalendarStatus).length
  ) {
    parts.push(
      "",
      "MACRO CALENDAR STATUS:",
      JSON.stringify(marketContext.macroCalendarStatus, null, 2)
    );
  }
  if (marketContext.calendarErrors?.length) {
    parts.push(
      "",
      "MACRO CALENDAR ERRORS:",
      JSON.stringify(marketContext.calendarErrors, null, 2)
    );
  }

  return parts.join("\n");
}
