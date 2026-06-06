// ============================================================
// MODULE REGISTRY — PolyCouncil
// ============================================================

import { COUNCIL_MODULE } from "./council.js";
import {
  ACTIVE_MODULE_KEY,
  DEFAULT_MODULE_ID,
} from "../storage-keys.js";

export const ALL_MODULES = {
  council: COUNCIL_MODULE,
};

export function getActiveModuleId() {
  if (typeof localStorage === "undefined") return DEFAULT_MODULE_ID;
  return localStorage.getItem(ACTIVE_MODULE_KEY) || DEFAULT_MODULE_ID;
}

export function setActiveModule(id) {
  if (!ALL_MODULES[id]) throw new Error(`Unknown module: ${id}`);
  localStorage.setItem(ACTIVE_MODULE_KEY, id);
}

export function getActiveModule() {
  const id = getActiveModuleId();
  return ALL_MODULES[id] ?? COUNCIL_MODULE;
}

export function getActiveAgentGroup() {
  return getActiveModule().agentGroup ?? null;
}

export function isBusinessModule(_moduleId) {
  return false;
}
