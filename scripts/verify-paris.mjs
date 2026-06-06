/**
 * PARIS portfolio mode verification (no network).
 */
import { REID, LEO, MASON } from "../src/agents.js";
import {
  BUSINESSES,
  getActiveBusiness,
  setActiveBusiness,
} from "../src/businesses/index.js";
import {
  addMemoryFact,
  getAgentMemory,
  memoryFactsStorageKey,
} from "../src/storage.js";

const ls = new Map();
global.localStorage = {
  getItem: (k) => ls.get(k) ?? null,
  setItem: (k, v) => ls.set(k, v),
};

const userId = "verify-paris-user";
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    failed += 1;
  } else {
    console.log("OK:", message);
  }
}

function header(label) {
  console.log(`\n=== ${label} ===`);
}

/** Mirrors renderBusinessSelect() in public/chat.html */
function buildDropdownOptions() {
  const options = [];
  const paris = BUSINESSES.paris;
  options.push({
    value: "paris",
    text: `⬡ ${paris.displayName}`,
    disabled: false,
    isDivider: false,
  });
  options.push({
    value: "",
    text: "─────────────────",
    disabled: true,
    isDivider: true,
  });
  for (const [id, biz] of Object.entries(BUSINESSES)) {
    if (biz.isPortfolio) continue;
    options.push({
      value: id,
      text: `  ${biz.displayName}`,
      disabled: false,
      isDivider: false,
    });
  }
  return options;
}

/** Mirrors updateBusinessChrome() sb-title behavior */
function headerForBusiness(biz) {
  return biz.displayName;
}

// ---------------------------------------------------------------------------
// 1. PARIS — all three businesses in each agent systemPrompt
// ---------------------------------------------------------------------------
header("1. PARIS system prompts (first 500 chars)");

setActiveBusiness("paris");
const parisBiz = getActiveBusiness();
const parisMemory = await getAgentMemory(userId, parisBiz);

const agents = [
  ["Reid", REID],
  ["Leo", LEO],
  ["Mason", MASON],
];

for (const [name, agent] of agents) {
  const prompt = await agent.buildContext(parisMemory, parisBiz, {
    textBlocks: "",
    mediaBlocks: [],
  });
  console.log(`\n--- ${name} (first 500 chars) ---`);
  console.log(prompt.slice(0, 500));

  assert(prompt.includes("PORTFOLIO CONTEXT"), `${name}: has portfolio context block`);

  const portfolioHeaders = [
    ...prompt.matchAll(/--- ([A-Z][A-Z0-9 /&]+) ---/g),
  ].map((m) => m[1]);

  for (const biz of parisBiz.businesses) {
    const expectedHeader = biz.displayName.toUpperCase();
    assert(
      portfolioHeaders.includes(expectedHeader),
      `${name}: portfolio section "${expectedHeader}"`
    );
  }
}

// ---------------------------------------------------------------------------
// 2. ICC only — no other business context
// ---------------------------------------------------------------------------
header("2. Iron City Cargo — single-business isolation");

setActiveBusiness("iron-city-cargo");
const iccBiz = getActiveBusiness();
const iccMemory = await getAgentMemory(userId, iccBiz);
const iccPrompt = await REID.buildContext(iccMemory, iccBiz, {
  textBlocks: "",
  mediaBlocks: [],
});

assert(iccPrompt.includes("Iron City Cargo"), "ICC: contains Iron City Cargo");
assert(!iccPrompt.includes("PORTFOLIO CONTEXT"), "ICC: no portfolio context block");
assert(!iccPrompt.includes("--- TANIVA HEALTH ---"), "ICC: no Taniva section");
assert(!iccPrompt.includes("--- HAWTHORNE LEGACY GROUP ---"), "ICC: no Hawthorne Legacy Group section");
assert(
  !iccPrompt.includes("Benefits Navigator"),
  "ICC: no Taniva-specific product content"
);
assert(
  !iccPrompt.includes("Independent insurance agency"),
  "ICC: no Hawthorne Legacy Group-specific description"
);

// ---------------------------------------------------------------------------
// 3. Memory scoping
// ---------------------------------------------------------------------------
header("3. Memory scoping");

ls.clear();
const parisFact = "Taylor is prioritizing Taniva in Q3";
await addMemoryFact(userId, parisFact, null, "paris");
await addMemoryFact(userId, "ICC-only fact", null, "iron-city-cargo");

const parisRaw = ls.get(memoryFactsStorageKey("paris"));
const iccRaw = ls.get(memoryFactsStorageKey("iron-city-cargo"));
const tanivaRaw = ls.get(memoryFactsStorageKey("taniva"));

assert(parisRaw?.includes(parisFact), "PARIS fact stored under memoryFacts_paris");
assert(!iccRaw?.includes(parisFact), "PARIS fact not in memoryFacts_iron-city-cargo");
assert(!tanivaRaw?.includes(parisFact), "PARIS fact not in memoryFacts_taniva");

setActiveBusiness("paris");
const portfolioMem = await getAgentMemory(userId, getActiveBusiness());
const parisSection = portfolioMem.sections.find((s) => s.label === "PARIS Portfolio");
assert(
  parisSection?.facts?.some((r) => r.fact === parisFact),
  "PARIS fact in portfolio agent memory section"
);

// ---------------------------------------------------------------------------
// 4. Dropdown structure
// ---------------------------------------------------------------------------
header("4. Dropdown structure");

const options = buildDropdownOptions();
assert(options[0].value === "paris", "dropdown[0] is PARIS");
assert(options[0].text.includes("⬡"), "PARIS option has ⬡ prefix");
assert(options[0].text.includes("PARIS Portfolio"), "PARIS option label");
assert(options[1].disabled && options[1].isDivider, "dropdown[1] is divider");
assert(options[2].value === "iron-city-cargo", "dropdown[2] is Iron City Cargo");
assert(options[3].value === "taniva", "dropdown[3] is Taniva");
assert(options[4].value === "hawthorne-legacy", "dropdown[4] is Hawthorne Legacy Group");
assert(options.length === 5, `dropdown has 5 entries (got ${options.length})`);

// ---------------------------------------------------------------------------
// 5. Header per selection
// ---------------------------------------------------------------------------
header("5. Header text per selection");

const headerCases = [
  ["paris", "PARIS Portfolio"],
  ["iron-city-cargo", "Iron City Cargo"],
  ["taniva", "Taniva Health"],
  ["hawthorne-legacy", "Hawthorne Legacy Group"],
];

for (const [id, expected] of headerCases) {
  setActiveBusiness(id);
  const biz = getActiveBusiness();
  const title = headerForBusiness(biz);
  assert(title === expected, `header for ${id} → "${expected}" (got "${title}")`);
}

// ---------------------------------------------------------------------------
// 6. Fourth business auto-injected into PARIS (no paris.js change)
// ---------------------------------------------------------------------------
header("6. Runtime injection — fourth business in registry");

const TEST_ID = "verify-fourth-biz";
const TEST_DISPLAY = "Acme Verify LLC";

BUSINESSES[TEST_ID] = {
  id: TEST_ID,
  displayName: TEST_DISPLAY,
  isPortfolio: false,
  owner: "Taylor McKinney",
};

try {
  setActiveBusiness("paris");
  const injected = getActiveBusiness();
  const names = injected.businesses.map((b) => b.displayName);
  assert(names.includes(TEST_DISPLAY), "fourth business appears in biz.businesses");
  assert(names.length === 4, `PARIS lists 4 non-portfolio businesses (got ${names.length})`);

  const masonPrompt = await MASON.buildContext(parisMemory, injected, {
    textBlocks: "",
    mediaBlocks: [],
  });
  assert(
    masonPrompt.includes(`--- ${TEST_DISPLAY.toUpperCase()} ---`),
    "fourth business section in Mason portfolio prompt"
  );

  const dropdownWithFourth = buildDropdownOptions().filter((o) => !o.isDivider);
  assert(
    dropdownWithFourth.some((o) => o.value === TEST_ID),
    "fourth business appears in dropdown options"
  );
} finally {
  delete BUSINESSES[TEST_ID];
}

// ---------------------------------------------------------------------------
header("Summary");
if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll PARIS verification checks passed.");
