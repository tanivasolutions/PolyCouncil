import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

import { buildLiveMarketContext } from "./market-context-core.js";

export const SAGE_BRIEF_PROMPT = `You are Sage, Macro and Sentiment Analyst. You have just received the latest market headlines and sentiment data. Produce a structured market brief with four sections:

SENTIMENT — what the Fear & Greed reading means right now
SWING SETUP — what looks tradeable in the next 3-10 days and why
HOLD THESIS — what sectors or themes are building strength or weakness over 3-6 months
WATCH LIST — specific tickers or sectors mentioned in the headlines worth monitoring

Be direct and specific. No filler. This is a brief, not an essay.`;

export const MARKET_BRIEF_STORAGE_KEY = "chatHistory_stocks";

const IS_VERCEL = Boolean(process.env.VERCEL);
const LOCAL_CACHE_PATH = path.join(process.cwd(), "data", "market-brief-latest.json");
const TMP_CACHE_PATH = "/tmp/market-brief-latest.json";

function resolveAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
}

export async function generateSageBrief(apiKey) {
  const client = new Anthropic({ apiKey });

  const marketContext = await buildLiveMarketContext();
  const contextBlock = marketContext.formattedContext;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1400,
    system: `${SAGE_BRIEF_PROMPT}

IMPORTANT:
You have live market context in the user message. Use it directly.
Do not say live market data was not provided.
Do not say macro calendar data was not provided if MACRO CALENDAR or MACRO CALENDAR JSON appears.
Include the macro calendar dates and days-until values.
Use SPY, QQQ, VIX, TNX, DXY, Fear & Greed, headlines, and macro calendar when present.`,
    messages: [{ role: "user", content: contextBlock }],
  });

  const briefContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  const timestamp = new Date().toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const now = new Date().toISOString();
  const chatId = `brief-${Date.now()}`;

  return {
    success: true,
    marketContext,
    chat: {
      id: chatId,
      title: `Sage Brief — ${timestamp}`,
      created_at: now,
      updated_at: now,
    },
    messages: [
      {
        id: `msg-u-${Date.now()}`,
        chat_id: chatId,
        role: "user",
        content: contextBlock,
        created_at: now,
      },
      {
        id: `msg-a-${Date.now() + 1}`,
        chat_id: chatId,
        role: "assistant",
        agent: "sage",
        content: briefContent,
        created_at: now,
      },
    ],
    storageKey: MARKET_BRIEF_STORAGE_KEY,
    generatedAt: now,
  };
}

function cacheFilePath() {
  return IS_VERCEL ? TMP_CACHE_PATH : LOCAL_CACHE_PATH;
}

export async function readMarketBriefCache() {
  try {
    const raw = await fs.readFile(cacheFilePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeMarketBriefCache(payload) {
  const filePath = cacheFilePath();
  if (!IS_VERCEL) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }
  await fs.writeFile(filePath, JSON.stringify(payload), "utf8");
}

export async function runMarketBriefJob() {
  const apiKey = resolveAnthropicApiKey();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local or Vercel environment variables."
    );
  }

  const payload = await generateSageBrief(apiKey);
  await writeMarketBriefCache(payload);
  return payload;
}
