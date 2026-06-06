/**
 * Reusable agent avatars: colored circle + Tabler icon, with initials fallback.
 * Uses the same @tabler/icons-webfont stylesheet as chat.html (vanilla JS).
 */

/** Tabler icon slug registry — keys match avatarIcon (lowercase). */
const TABLER_ICON_REGISTRY = {
  shield: "ti-shield",
  compass: "ti-compass",
  search: "ti-search",
  wrench: "ti-wrench",
  sparkles: "ti-sparkles",
  clock3: "ti-clock",
  calculator: "ti-calculator",
  cog: "ti-settings",
  rocket: "ti-rocket",
  candlestickchart: "ti-chart-candle",
  linechart: "ti-chart-line",
  landmark: "ti-building-bank",
  badgedollarsign: "ti-currency-dollar",
  globe2: "ti-world",
  activity: "ti-activity",
  home: "ti-home",
  brickwall: "ti-wall",
  users: "ti-users",
  scale: "ti-scale",
  truck: "ti-truck",
  scanheart: "ti-heart-rate-monitor",
  shieldcheck: "ti-shield-check",
};

export const AVATAR_ICON_SIZES = {
  bar: 12,
  message: 12,
  default: 14,
  tooltip: 14,
  chip: 11,
};

function normalizeIconKey(iconName) {
  return String(iconName ?? "")
    .trim()
    .toLowerCase();
}

/**
 * @param {string | null | undefined} iconName
 * @param {string | null | undefined} [fallbackName]
 * @returns {string | null} Tabler icon class (e.g. "ti-shield")
 */
export function resolveAvatarIcon(iconName, fallbackName) {
  const primary = TABLER_ICON_REGISTRY[normalizeIconKey(iconName)];
  if (primary) return primary;
  return TABLER_ICON_REGISTRY[normalizeIconKey(fallbackName)] ?? null;
}

/**
 * @param {{
 *   avatarIcon?: string,
 *   avatarIconFallback?: string,
 *   icon?: string,
 *   iconFallback?: string,
 *   avatarInitial?: string,
 * }} [agent]
 */
export function resolveAgentAvatarFields(agent) {
  const icon = agent?.avatarIcon ?? agent?.icon ?? null;
  const iconFallback =
    agent?.avatarIconFallback ?? agent?.iconFallback ?? null;
  const initial = String(agent?.avatarInitial ?? "?").trim() || "?";
  return { icon, iconFallback, initial };
}

/**
 * @param {{ icon?: string | null, iconFallback?: string | null, initial?: string, showIcon?: boolean }} spec
 * @param {number} [size]
 */
export function buildAgentAvatarInnerHtml(spec, size = AVATAR_ICON_SIZES.default) {
  if (spec.showIcon === false) return "";

  const tablerIcon = resolveAvatarIcon(spec.icon, spec.iconFallback);
  if (tablerIcon) {
    return `<i class="ti ${tablerIcon} agent-av-icon" style="font-size:${size}px;line-height:1" aria-hidden="true"></i>`;
  }

  const text = String(spec.initial ?? "?").trim() || "?";
  return `<span class="agent-av-initial" aria-hidden="true">${escapeAvatarText(text)}</span>`;
}

/**
 * @param {{
 *   icon?: string | null,
 *   iconFallback?: string | null,
 *   initial?: string,
 *   avClass: string,
 *   size?: number,
 *   extraClass?: string,
 *   rootClass?: string,
 *   showIcon?: boolean,
 * }} options
 */
export function buildAgentAvatarHtml({
  icon,
  iconFallback,
  initial,
  avClass,
  size = AVATAR_ICON_SIZES.default,
  extraClass = "",
  rootClass = "av",
  showIcon = true,
}) {
  if (showIcon === false) return "";

  const inner = buildAgentAvatarInnerHtml(
    { icon, iconFallback, initial, showIcon },
    size
  );
  const classes = [rootClass, avClass, extraClass].filter(Boolean).join(" ");
  return `<div class="${classes}" aria-hidden="true">${inner}</div>`;
}

/**
 * @param {HTMLElement} container
 * @param {{ icon?: string | null, iconFallback?: string | null, initial?: string, avClass: string, size?: number, extraClass?: string, rootClass?: string, showIcon?: boolean }} options
 */
export function mountAgentAvatar(container, options) {
  container.innerHTML = buildAgentAvatarHtml(options);
  return container.firstElementChild;
}

function escapeAvatarText(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
