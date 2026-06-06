const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const FETCH_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
};

const MONTH_NUM = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const FOMC_MONTHS = new Set([
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]);

const BLS_SCHEDULES = {
  nextCPI: {
    key: "nextCPI",
    url: "https://www.bls.gov/schedule/news_release/cpi.htm",
    source: "BLS CPI release schedule",
    validate: (html) => /Consumer Price Index/i.test(html) && /08:30/i.test(html),
  },
  nextPPI: {
    key: "nextPPI",
    url: "https://www.bls.gov/schedule/news_release/ppi.htm",
    source: "BLS PPI release schedule",
    validate: (html) => /Producer Price Index/i.test(html) && /08:30/i.test(html),
  },
  nextNFP: {
    key: "nextNFP",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
    source: "BLS Employment Situation (NFP) schedule",
    validate: (html) => /Employment Situation/i.test(html) && /08:30/i.test(html),
  },
};

const BEA_PCE = {
  key: "nextPCE",
  url: "https://www.bea.gov/news/schedule",
  source: "BEA Personal Income and Outlays (PCE) schedule",
  validate: (html) => /Personal Income and Outlays/i.test(html),
};

const FOMC_SOURCE = {
  key: "nextFOMC",
  url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  source: "Federal Reserve FOMC calendar",
  validate: (html) => /FOMC Meetings/i.test(html),
};

/** Last-resort dates when Fed/BLS/BEA are unreachable (refresh after official schedule updates). */
const FALLBACK_CALENDAR_2026 = {
  nextFOMC: { date: "2026-06-17", label: "FOMC decision (fallback)" },
  nextCPI: { date: "2026-06-10", label: "CPI release (fallback)" },
  nextPPI: { date: "2026-06-11", label: "PPI release (fallback)" },
  nextNFP: { date: "2026-06-05", label: "NFP / Employment Situation (fallback)" },
  nextPCE: { date: "2026-06-25", label: "PCE / Personal Income & Outlays (fallback)" },
};

async function fetchHtmlDirect(url, timeoutMs = 12000) {
  const res = await fetch(url, {
    headers: FETCH_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

async function fetchHtmlViaProxy(url, timeoutMs = 20000) {
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl, {
    headers: { "User-Agent": BROWSER_UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`proxy HTTP ${res.status}`);
  }
  const html = await res.text();
  if (!html || html.length < 200) {
    throw new Error("proxy returned empty body");
  }
  return html;
}

async function fetchHtmlRobust(url, validate) {
  const attempts = [];
  for (const via of ["direct", "proxy"]) {
    try {
      const html =
        via === "direct" ? await fetchHtmlDirect(url) : await fetchHtmlViaProxy(url);
      if (validate && !validate(html)) {
        throw new Error("response failed content validation");
      }
      if (/access denied|request blocked|captcha|cf-browser-verification/i.test(html)) {
        throw new Error("upstream blocked or challenged request");
      }
      return { html, via };
    } catch (err) {
      attempts.push(`${via}: ${err.message ?? "failed"}`);
    }
  }
  throw new Error(attempts.join("; "));
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n+/g, "\n");
}

function parseMonthToken(token) {
  const key = token.replace(/\./g, "").toLowerCase();
  return MONTH_NUM[key] ?? null;
}

/** Parse BLS schedule tables: "May 2026 Jun. 10, 2026 08:30 AM" */
export function parseBlsReleaseRows(html) {
  const rows = [];
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of trs) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const m = text.match(
      /^[A-Za-z]+ \d{4}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})\s+08:30/i
    );
    if (!m) continue;
    const month = parseMonthToken(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (!month || !day || !year) continue;
    rows.push({ date: toDateIso(year, month, day), label: text.split(/\s+08:30/)[0] });
  }
  return rows;
}

/** Fed FOMC decision days (last day of each scheduled meeting range) for a calendar year. */
export function parseFomcDecisionDates(html, year) {
  const title = `${year} FOMC Meetings`;
  const start = html.indexOf(title);
  if (start < 0) {
    throw new Error(`${title} section not found`);
  }
  const nextYear = html.indexOf(`${year + 1} FOMC Meetings`, start + title.length);
  const section = html.slice(start, nextYear > start ? nextYear : start + 12000);
  const lines = stripHtml(section)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const seenMonths = new Set();
  const dates = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^20\d{2}$/.test(lines[i]) && Number(lines[i]) > year) break;
    if (!FOMC_MONTHS.has(lines[i]) || seenMonths.has(lines[i])) continue;
    const range = lines[i + 1]?.match(/^(\d{1,2})-(\d{1,2})\*?$/);
    if (!range) continue;
    seenMonths.add(lines[i]);
    const monthNum = MONTH_NUM[lines[i].toLowerCase()];
    const endDay = Number(range[2]);
    dates.push({
      date: toDateIso(year, monthNum, endDay),
      label: `FOMC decision (${lines[i]} ${range[1]}-${range[2]}, ${year})`,
    });
  }
  if (!dates.length) {
    throw new Error(`No ${year} FOMC meeting dates parsed`);
  }
  return dates;
}

/** BEA Personal Income and Outlays — includes PCE. */
export function parseBeaPceReleaseRows(html) {
  const rows = [];
  const trs = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const match of trs) {
    const text = match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!/personal income and outlays/i.test(text)) continue;
    const m = text.match(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+8:30\s+AM.*?(\d{4})/i
    );
    if (!m) continue;
    const month = MONTH_NUM[m[1].toLowerCase()];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (!month || !day || !year) continue;
    rows.push({
      date: toDateIso(year, month, day),
      label: "Personal Income and Outlays (PCE)",
    });
  }
  return rows;
}

function toDateIso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function startOfDayUtc(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysUntil(isoDate) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUtc = startOfDayUtc(isoDate);
  const diff = Math.round((targetUtc - todayUtc) / 86400000);
  return Math.max(0, diff);
}

function nextReleaseOnOrAfter(rows) {
  const today = toDateIso(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth() + 1,
    new Date().getUTCDate()
  );
  const upcoming = rows
    .filter((r) => r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  return upcoming[0] ?? null;
}

function toMacroSlot(release, sourceStatus = "ok") {
  if (!release) return null;
  return {
    date: release.date,
    daysUntil: daysUntil(release.date),
    label: release.label,
    sourceStatus,
  };
}

function applyFallback(key, macroCalendar, sourceStatus, errors) {
  const fb = FALLBACK_CALENDAR_2026[key];
  if (!fb) return;
  macroCalendar[key] = toMacroSlot(fb, sourceStatus);
  errors.push({
    key,
    source: "macro-calendar-fallback",
    message: `Using embedded fallback date ${fb.date} because live schedule fetch failed`,
    level: "fallback",
  });
}

function logMacroCalendarRaw(label, data) {
  console.log("MACRO CALENDAR RAW", label, JSON.stringify(data, null, 2));
}

/**
 * Upcoming US macro catalyst dates from Fed / BLS / BEA official schedules.
 */
export async function fetchMacroCalendar() {
  const errors = [];
  const sourceStatus = {};
  const year = new Date().getUTCFullYear();
  const macroCalendar = {
    nextFOMC: null,
    nextCPI: null,
    nextPPI: null,
    nextNFP: null,
    nextPCE: null,
  };

  const tasks = [
    (async () => {
      const { key } = FOMC_SOURCE;
      try {
        const { html, via } = await fetchHtmlRobust(FOMC_SOURCE.url, FOMC_SOURCE.validate);
        const rows = parseFomcDecisionDates(html, year);
        const next = nextReleaseOnOrAfter(rows);
        if (!next) {
          throw new Error("No upcoming FOMC dates in schedule");
        }
        macroCalendar[key] = toMacroSlot(next, "ok");
        sourceStatus[key] = { status: "ok", via, rowCount: rows.length };
      } catch (err) {
        sourceStatus[key] = { status: "error", message: err.message ?? "fetch failed" };
        errors.push({
          key,
          source: FOMC_SOURCE.source,
          message: err.message ?? "fetch failed",
        });
        applyFallback(key, macroCalendar, "fallback", errors);
      }
    })(),
    ...Object.values(BLS_SCHEDULES).map(async ({ key, url, source, validate }) => {
      try {
        const { html, via } = await fetchHtmlRobust(url, validate);
        const rows = parseBlsReleaseRows(html);
        if (!rows.length) {
          throw new Error("BLS schedule table parsed 0 rows");
        }
        const next = nextReleaseOnOrAfter(rows);
        if (!next) {
          throw new Error("No upcoming BLS releases in schedule");
        }
        macroCalendar[key] = toMacroSlot(next, "ok");
        sourceStatus[key] = { status: "ok", via, rowCount: rows.length };
      } catch (err) {
        sourceStatus[key] = { status: "error", message: err.message ?? "fetch failed" };
        errors.push({
          key,
          source,
          message: err.message ?? "fetch failed",
        });
        applyFallback(key, macroCalendar, "fallback", errors);
      }
    }),
    (async () => {
      const { key } = BEA_PCE;
      try {
        const { html, via } = await fetchHtmlRobust(BEA_PCE.url, BEA_PCE.validate);
        const rows = parseBeaPceReleaseRows(html);
        if (!rows.length) {
          throw new Error("BEA schedule table parsed 0 PCE rows");
        }
        const next = nextReleaseOnOrAfter(rows);
        if (!next) {
          throw new Error("No upcoming PCE releases in schedule");
        }
        macroCalendar[key] = toMacroSlot(next, "ok");
        sourceStatus[key] = { status: "ok", via, rowCount: rows.length };
      } catch (err) {
        sourceStatus[key] = { status: "error", message: err.message ?? "fetch failed" };
        errors.push({
          key,
          source: BEA_PCE.source,
          message: err.message ?? "fetch failed",
        });
        applyFallback(key, macroCalendar, "fallback", errors);
      }
    })(),
  ];

  await Promise.all(tasks);

  const hasAny = Object.values(macroCalendar).some(Boolean);
  const payload = {
    macroCalendar,
    errors,
    sourceStatus,
    sources: [
      FOMC_SOURCE.source,
      ...Object.values(BLS_SCHEDULES).map((s) => s.source),
      BEA_PCE.source,
    ],
    success: hasAny,
  };
  logMacroCalendarRaw("fetchMacroCalendar", payload);
  return payload;
}

export function formatMacroCalendarBlock(macroCalendar, calendarErrors = [], sourceStatus = {}) {
  const lines = ["MACRO CALENDAR (official US release schedules):", ""];
  const entries = [
    ["FOMC decision", "nextFOMC"],
    ["CPI", "nextCPI"],
    ["PPI", "nextPPI"],
    ["NFP (Employment Situation)", "nextNFP"],
    ["PCE (Personal Income & Outlays)", "nextPCE"],
  ];

  let any = false;
  for (const [name, key] of entries) {
    const slot = macroCalendar?.[key];
    const status = sourceStatus?.[key];
    if (slot?.date) {
      any = true;
      const days = slot.daysUntil ?? daysUntil(slot.date);
      const via =
        slot.sourceStatus === "fallback" || status?.status === "fallback"
          ? " [fallback]"
          : status?.via
            ? ` [${status.via}]`
            : "";
      lines.push(
        `- ${name}: ${slot.date} (${days === 0 ? "today" : days === 1 ? "1 day" : `${days} days`} away)${via}`
      );
    } else {
      lines.push(`- ${name}: unavailable`);
    }
  }

  lines.push("");

  if (calendarErrors.length) {
    lines.push(
      "MACRO CALENDAR — source errors / fallbacks:",
      ...calendarErrors.map(
        (e) =>
          `- ${e.key}: ${e.source} — ${e.message}${e.level ? ` (${e.level})` : ""}`
      ),
      ""
    );
  }

  if (Object.keys(sourceStatus).length) {
    lines.push(
      "MACRO CALENDAR — source status:",
      JSON.stringify(sourceStatus, null, 2),
      ""
    );
  }

  if (!any && !calendarErrors.length) {
    lines.push(
      "- Macro calendar feed did not load: no release dates resolved.",
      "- Sources: Federal Reserve, BLS, BEA (see server logs / /api/market-context/debug).",
      ""
    );
  }

  return lines.join("\n").trimEnd();
}
