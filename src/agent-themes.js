/**
 * Shared agent UI theme slugs and class names.
 * Business agents (reid, leo, mason) use existing CSS variables in styles.css.
 * Council and Stocks agents use parallel --agent-{slug} tokens.
 */

export const BUSINESS_THEME_KEYS = new Set(["reid", "leo", "mason"]);

export const COUNCIL_THEME_KEYS = new Set([
  "advocate",
  "architect",
  "skeptic",
  "pragmatist",
  "innovator",
  "temporal",
]);

export const STOCKS_THEME_KEYS = new Set(["nova", "felix", "sage"]);

export const ALL_THEME_KEYS = new Set([
  ...BUSINESS_THEME_KEYS,
  ...COUNCIL_THEME_KEYS,
  ...STOCKS_THEME_KEYS,
]);

/** Resolve stable theme slug from agent map key (keys match theme slugs). */
export function resolveAgentTheme(agentKey) {
  const slug = String(agentKey ?? "")
    .trim()
    .toLowerCase();
  if (ALL_THEME_KEYS.has(slug)) return slug;
  return "reid";
}

/**
 * UI class bundle — same shape for every agent; CSS handles colors per theme.
 */
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

/** Default @mention routing hint shown in agent bar tooltips. */
export function defaultAgentTooltipHint(agentName) {
  return `Tag @${agentName} to message this agent directly.`;
}
