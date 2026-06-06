/** Viewport-safe placement for agent bar tooltips (sidebar + main column). */

const EDGE_FRACTION = 0.28;
const CARET_EDGE_PAD = 20;

/**
 * @returns {{ safeLeft: number, safeRight: number, safeTop: number, safeBottom: number, pad: number }}
 */
export function getTooltipSafeBounds() {
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const mainEl = document.querySelector(".chat-app .main");
  const main = mainEl?.getBoundingClientRect();
  let safeLeft = (main?.left ?? 0) + pad;
  let safeRight = (main?.right ?? vw) - pad;
  const safeTop = (main?.top ?? 0) + pad;
  const safeBottom = vh - pad;

  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    const sr = sidebar.getBoundingClientRect();
    const onScreen =
      sr.width > 0 && sr.right > 0 && sr.left < vw && sr.bottom > 0;
    if (onScreen) {
      const overlay =
        document.body.classList.contains("sidebar-open") ||
        getComputedStyle(sidebar).position === "fixed";
      if (overlay || sr.right > safeLeft - pad) {
        safeLeft = Math.max(safeLeft, sr.right + pad);
      }
    }
  }

  if (safeRight - safeLeft < 80) {
    safeLeft = pad;
    safeRight = vw - pad;
  }

  return { safeLeft, safeRight, safeTop, safeBottom, pad };
}

/**
 * @param {HTMLElement} btn
 * @param {HTMLElement} tip
 */
export function positionAgentTooltip(btn, tip) {
  const bounds = getTooltipSafeBounds();
  const btnRect = btn.getBoundingClientRect();
  const gap = 10;

  const btnCenterX = btnRect.left + btnRect.width / 2;
  const safeWidth = Math.max(bounds.safeRight - bounds.safeLeft, 80);
  const maxTipW = Math.min(360, Math.floor(safeWidth));

  tip.style.maxWidth = `${maxTipW}px`;
  const tipW = tip.offsetWidth || tip.scrollWidth;
  const tipH = tip.offsetHeight || tip.scrollHeight;

  const btnMidInSafe = (btnCenterX - bounds.safeLeft) / safeWidth;
  let left;

  if (btnMidInSafe < EDGE_FRACTION) {
    left = Math.max(bounds.safeLeft, btnRect.left);
  } else if (btnMidInSafe > 1 - EDGE_FRACTION) {
    left = btnRect.right - tipW;
  } else {
    left = btnCenterX - tipW / 2;
  }

  left = Math.max(bounds.safeLeft, Math.min(left, bounds.safeRight - tipW));

  let caretX = btnCenterX - left;
  caretX = Math.max(
    CARET_EDGE_PAD,
    Math.min(caretX, Math.max(CARET_EDGE_PAD, tipW - CARET_EDGE_PAD))
  );

  let top = btnRect.bottom + gap;
  let above = false;
  if (top + tipH > bounds.safeBottom) {
    top = Math.max(bounds.safeTop, btnRect.top - tipH - gap);
    above = true;
  }

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.setProperty("--tooltip-caret-x", `${Math.round(caretX)}px`);
  tip.classList.toggle("is-above", above);

  return { above };
}

/**
 * @param {ParentNode} [root]
 */
export function repositionVisibleAgentTooltips(root = document) {
  root.querySelectorAll(".agent-desc-tooltip.is-visible").forEach((tip) => {
    const btn = tip.closest(".agent-desc-name-btn");
    if (!btn) return;
    tip.style.visibility = "hidden";
    positionAgentTooltip(btn, tip);
    tip.style.visibility = "";
  });
}
