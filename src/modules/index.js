// ============================================================
// MODULE REGISTRY
// Unifies businesses + council + stocks under one interface.
// getActiveModule() is the new getActiveBusiness() equivalent
// for anything that needs to know the current agent group.
// ============================================================

import { BUSINESSES, getActiveBusiness } from "../businesses/index.js";
import { COUNCIL_MODULE } from "./council.js";
import { STOCKS_MODULE } from "./stocks.js";

// Business modules wrapped with moduleType for the UI layer
function wrapBusiness(biz) {
  return {
    ...biz,
    moduleType: "business",
  };
}

// All top-level modules the sidebar can show
export const ALL_MODULES = {
  council: COUNCIL_MODULE,
  stocks: STOCKS_MODULE,
  ...Object.fromEntries(
    Object.entries(BUSINESSES).map(([id, biz]) => [id, wrapBusiness(biz)])
  ),
};

const ACTIVE_MODULE_KEY = "activeModule";
const DEFAULT_MODULE_ID = "iron-city-cargo";

export function getActiveModuleId() {
  if (typeof localStorage === "undefined") return DEFAULT_MODULE_ID;
  return localStorage.getItem(ACTIVE_MODULE_KEY) || DEFAULT_MODULE_ID;
}

export function setActiveModule(id) {
  if (!ALL_MODULES[id]) throw new Error(`Unknown module: ${id}`);
  localStorage.setItem(ACTIVE_MODULE_KEY, id);
  // Keep businesses/index in sync for existing code that calls getActiveBusiness()
  if (BUSINESSES[id]) {
    localStorage.setItem("activeBusiness", id);
  }
}

export function getActiveModule() {
  const id = getActiveModuleId();
  const mod = ALL_MODULES[id];
  if (!mod) return wrapBusiness(BUSINESSES[DEFAULT_MODULE_ID]);

  // For business modules, delegate to getActiveBusiness() to preserve
  // portfolio expansion logic (paris populates .businesses array)
  if (mod.moduleType === "business") {
    const biz = getActiveBusiness();
    return wrapBusiness(biz);
  }

  return mod;
}

// Returns the agent map for the currently active module.
// Business modules use the shared Reid/Leo/Mason set from app.js.
// Non-business modules define their own agentGroup on the module object.
export function getActiveAgentGroup() {
  const mod = getActiveModule();
  if (mod.agentGroup) return mod.agentGroup;
  // Business modules — caller (app.js) uses its own AGENTS constant
  return null;
}

export function isBusinessModule(moduleId) {
  return Boolean(BUSINESSES[moduleId]);
}
