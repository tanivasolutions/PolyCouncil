import {
  COUNCIL_AGENTS,
  COUNCIL_BROADCAST_INSTRUCTIONS,
  buildCouncilRoutingPrompt,
} from "../agent-groups/council-agents.js";

export const COUNCIL_MODULE = {
  id: "council",
  displayName: "Council",
  moduleType: "council",
  description:
    "Multi-perspective advisory council — six cognitive lenses on any question.",
  agentGroup: COUNCIL_AGENTS,
  broadcastInstructions: COUNCIL_BROADCAST_INSTRUCTIONS,
  buildRoutingPrompt: buildCouncilRoutingPrompt,
  isPortfolio: false,

  docTagOptions: [
    "strategy",
    "research",
    "risk",
    "planning",
    "innovation",
    "user-research",
    "legal",
    "financial",
    "all",
  ],
  agentTagKeywords: {
    advocate: ["user-research", "ux", "research", "feedback", "customer"],
    architect: ["strategy", "planning", "architecture", "systems", "all"],
    skeptic: ["risk", "legal", "compliance", "audit", "research"],
    pragmatist: ["planning", "process", "operations", "financial"],
    innovator: ["innovation", "research", "strategy", "market"],
    temporal: ["planning", "strategy", "risk", "financial"],
  },
};
