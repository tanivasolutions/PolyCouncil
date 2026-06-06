// ============================================================
// BRIEF POLLER — checks for cron-generated market briefs
// and writes them into the Stocks chat store (+ cloud when signed in)
// ============================================================

import { importMarketBriefPayload } from "./storage.js";
import { LAST_BRIEF_KEY } from "./userPreferences.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // check every 5 minutes

async function fetchLatestBrief() {
  const isVercel =
    window.location.hostname !== "localhost" &&
    !window.location.hostname.includes("127.0.0.1");
  if (!isVercel) return null;

  try {
    const res = await fetch("/api/market-brief");
    if (res.status === 204 || !res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function startBriefPoller(onNewBrief) {
  async function check() {
    const brief = await fetchLatestBrief();
    if (!brief?.success) return;

    const result = importMarketBriefPayload(brief);
    if (result.imported && onNewBrief) {
      onNewBrief(brief);
    }

    localStorage.setItem(LAST_BRIEF_KEY, new Date().toISOString());
  }

  check();
  return setInterval(check, POLL_INTERVAL_MS);
}

export function stopBriefPoller(intervalId) {
  clearInterval(intervalId);
}
