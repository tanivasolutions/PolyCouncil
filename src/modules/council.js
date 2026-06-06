import {
  EXAMPLE_AGENTS,
  EXAMPLE_BROADCAST_INSTRUCTIONS,
  buildExampleRoutingPrompt,
} from "../data/example-agents.js";

export const COUNCIL_MODULE = {
  id: "council",
  displayName: "Council",
  moduleType: "council",
  description:
    "Multi-perspective advisory council — distinct lenses on any question.",
  agentGroup: EXAMPLE_AGENTS,
  broadcastInstructions: EXAMPLE_BROADCAST_INSTRUCTIONS,
  buildRoutingPrompt: buildExampleRoutingPrompt,
  isPortfolio: false,

  docTagOptions: [
    "strategy",
    "research",
    "risk",
    "planning",
    "innovation",
    "operations",
    "financial",
    "all",
  ],
  agentTagKeywords: {
    strategist: ["strategy", "planning", "architecture", "systems", "all"],
    skeptic: ["risk", "research", "audit", "compliance", "legal"],
    pragmatist: ["planning", "process", "operations", "financial"],
  },
};
