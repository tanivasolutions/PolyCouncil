import { IRON_CITY_CARGO } from "./iron-city-cargo.js";
import { PARIS } from "./paris.js";
import { HAWTHORNE_LEGACY } from "./hawthorne-legacy.js";
import { TANIVA } from "./taniva.js";

const DEFAULT_BUSINESS_ID = "iron-city-cargo";
const ACTIVE_BUSINESS_KEY = "activeBusiness";

export const BUSINESSES = {
  "paris": PARIS,
  "iron-city-cargo": IRON_CITY_CARGO,
  "taniva": TANIVA,
  "hawthorne-legacy": HAWTHORNE_LEGACY,
};

export function getActiveBusiness() {
  let id = DEFAULT_BUSINESS_ID;

  if (typeof localStorage !== "undefined") {
    id = localStorage.getItem(ACTIVE_BUSINESS_KEY) || DEFAULT_BUSINESS_ID;
  }

  const config = BUSINESSES[id] ?? BUSINESSES[DEFAULT_BUSINESS_ID];

  if (config.isPortfolio) {
    return {
      ...config,
      businesses: Object.values(BUSINESSES).filter((b) => !b.isPortfolio),
    };
  }

  return config;
}

export function setActiveBusiness(id) {
  if (!BUSINESSES[id]) {
    throw new Error(`Unknown business: ${id}`);
  }

  localStorage.setItem(ACTIVE_BUSINESS_KEY, id);
}
