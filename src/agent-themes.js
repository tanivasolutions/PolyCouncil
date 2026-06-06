/**
 * Shared agent UI theme slugs and class names.
 */

export const COUNCIL_THEME_KEYS = new Set([
  "strategist",
  "skeptic",
  "pragmatist",
  "advocate",
  "innovator",
  "temporal",
]);

/** Reserved for optional clarity-focused agents (extend when customizing). */
export const CLARITY_THEME_KEYS = new Set([]);

export const ALL_THEME_KEYS = new Set([
  ...COUNCIL_THEME_KEYS,
  ...CLARITY_THEME_KEYS,
]);

export function resolveAgentTheme(agentKey) {
  const slug = String(agentKey ?? "")
    .trim()
    .toLowerCase();
  if (ALL_THEME_KEYS.has(slug)) return slug;
  return "strategist";
}

export function buildAgentUIMeta(agentKey) {
  const theme = resolveAgentTheme(agentKey);
  return {
    theme,
    avClass: `av-${theme}`,
    senderClass: theme,
    tagClass: `tag-${theme}`,
    bubbleClass: `bubble-${theme}`,
    thClass: `th-${theme}`,
  };
}

export function defaultAgentTooltipHint(agentName) {
  return `Tag @${agentName} to message this agent directly.`;
}
