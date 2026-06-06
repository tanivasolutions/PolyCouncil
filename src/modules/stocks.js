import {
  STOCKS_AGENTS,
  STOCKS_BROADCAST_INSTRUCTIONS,
  buildStocksRoutingPrompt,
} from "../agent-groups/stocks-agents.js";

export const STOCKS_MODULE = {
  id: "stocks",
  displayName: "Stocks",
  moduleType: "stocks",
  description:
    "Market analysis panel — technical, fundamental, and macro perspectives.",
  agentGroup: STOCKS_AGENTS,
  broadcastInstructions: STOCKS_BROADCAST_INSTRUCTIONS,
  buildRoutingPrompt: buildStocksRoutingPrompt,
  isPortfolio: false,

  docTagOptions: [
    "technical",
    "fundamental",
    "macro",
    "earnings",
    "news",
    "research",
    "watchlist",
    "all",
  ],
  agentTagKeywords: {
    nova: ["technical", "watchlist", "news", "all"],
    felix: ["fundamental", "earnings", "research", "financial"],
    sage: ["macro", "research", "news", "all"],
  },
};
