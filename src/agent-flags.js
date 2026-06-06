import { getActiveModule } from "./modules/index.js";

function getActiveAgentIds() {
  const mod = getActiveModule();
  return Object.keys(mod?.agentGroup ?? {});
}

function agentDisplayName(agentId, mod) {
  if (mod?.agentGroup?.[agentId]?.name) return mod.agentGroup[agentId].name;
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function extractParagraphAfter(text, startIndex) {
  const after = text.slice(startIndex);
  const end = after.search(/\n\s*\n/);
  const paragraph = (end === -1 ? after : after.slice(0, end)).trim();
  return paragraph;
}

function extractSentenceContaining(text, pattern) {
  const match = text.match(pattern);
  if (!match) return "";

  const idx = match.index ?? 0;
  const before = text.slice(0, idx);
  const fromSentenceStart = Math.max(
    before.lastIndexOf("\n") + 1,
    before.lastIndexOf(". ") + 2,
    before.lastIndexOf("! ") + 2,
    before.lastIndexOf("? ") + 2,
    0
  );

  const rest = text.slice(fromSentenceStart);
  const end = rest.search(/(?:[.!?](?:\s|$))|\n\n/);
  const sentence =
    end === -1
      ? rest
      : rest.slice(
          0,
          end +
            (rest[end] === "." || rest[end] === "!" || rest[end] === "?"
              ? 1
              : 0)
        );

  return sentence.trim();
}

export function detectAgentFlags(sourceAgent, text) {
  if (!text || typeof text !== "string") return [];

  const mod = getActiveModule();
  const AGENT_IDS = getActiveAgentIds();
  const source = sourceAgent.toLowerCase();
  const flags = [];
  const seenTargets = new Set();

  function add(targetAgent, context) {
    const target = targetAgent.toLowerCase();
    if (!AGENT_IDS.includes(target) || target === source || seenTargets.has(target))
      return;
    const trimmed = context?.replace(/\s+/g, " ").trim();
    if (!trimmed) return;
    seenTargets.add(target);
    flags.push({ targetAgent: target, context: trimmed });
  }

  for (const target of AGENT_IDS) {
    const name = agentDisplayName(target, mod);
    const colonPattern = new RegExp(
      `Flag to ${name}:\\s*([^\\n]+(?:\\n(?!\\n)[^\\n]+)*)`,
      "gi"
    );
    let match;
    while ((match = colonPattern.exec(text)) !== null) add(target, match[1]);
  }

  for (const target of AGENT_IDS) {
    const name = agentDisplayName(target, mod);
    const redirectPattern = new RegExp(
      `Redirecting to ${name}[.:]?\\s*([^\\n]*)`,
      "gi"
    );
    let match;
    while ((match = redirectPattern.exec(text)) !== null) {
      const context =
        match[1]?.trim() ||
        extractParagraphAfter(text, match.index + match[0].length) ||
        match[0].trim();
      add(target, context);
    }
  }

  return flags;
}

export function buildFlagFollowUpUserMessage(sourceAgentName, flagContext) {
  return `[${sourceAgentName}] has flagged the following for you: ${flagContext.trim()}\n\nRespond directly to this.`;
}
