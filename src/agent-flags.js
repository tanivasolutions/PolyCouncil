import { getActiveModule } from "./modules/index.js";

function getActiveAgentIds() {
  const mod = getActiveModule();
  if (mod?.agentGroup) return Object.keys(mod.agentGroup);
  // Business fallback
  return ["reid", "leo", "mason"];
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

  // Business-specific implicit patterns — only fire when in a business module
  if (!mod?.agentGroup) {
    const implicitPatterns = [
      { target: "reid", pattern: /I've flagged this for Reid[.:]?\s*([^\n]+)?/gi },
      { target: "leo", pattern: /(?:I've asked Leo|I'm asking Leo)[.:]?\s*([^\n]+)?/gi },
      { target: "mason", pattern: /I've flagged this for Mason[.:]?\s*([^\n]+)?/gi },
      { target: "reid", pattern: /Reid should run the numbers/gi },
      { target: "leo", pattern: /Leo should check/gi },
    ];

    for (const { target, pattern } of implicitPatterns) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        const context =
          match[1]?.trim() || extractSentenceContaining(text, re);
        add(target, context);
      }
    }
  }

  return flags;
}

export function buildFlagFollowUpUserMessage(sourceAgentName, flagContext) {
  return `[${sourceAgentName}] has flagged the following for you: ${flagContext.trim()}\n\nRespond directly to this.`;
}
