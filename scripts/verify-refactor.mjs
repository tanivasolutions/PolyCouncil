/**
 * Consistency checks for multi-business refactor (no network).
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "fs";
import { REID, LEO, MASON, buildRoutingPrompt } from "../src/agents.js";
import {
  BUSINESSES,
  getActiveBusiness,
  setActiveBusiness,
} from "../src/businesses/index.js";
import {
  addMemoryFact,
  chatHistoryStorageKey,
  createChat,
  getChats,
  getMemory,
  memoryFactsStorageKey,
  migrateOldData,
  migrateDocumentMetadataV2,
} from "../src/storage.js";
import {
  docMetaStorageKey,
  initDocumentDB,
} from "../documents/documentStore.js";

const agentsSource = readFileSync("src/agents.js", "utf8");

const forbiddenInAgents = [
  /Iron City Cargo/i,
  /Taylor McKinney/i,
  /Birmingham/i,
  /Truck 101/i,
  /Kenworth/i,
  /Marcus J\./i,
  /Deon C\./i,
  /James C\./i,
  /Sandra R\./i,
  /11-hour driving limit/i,
  /SEGMENT FINANCIAL KNOWLEDGE/i,
  /THE FOUR SEGMENTS MASON EVALUATES/i,
  /USPS BID ANALYSIS SKILL/i,
  /Maintenance & intervals — read/i,
];

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    failed += 1;
  } else {
    console.log("OK:", message);
  }
}

for (const pattern of forbiddenInAgents) {
  assert(!pattern.test(agentsSource), `agents.js must not match ${pattern}`);
}

for (const [id, biz] of Object.entries(BUSINESSES)) {
  const src = readFileSync(`src/businesses/${id}.js`, "utf8");
  assert(
    !/systemPrompt\s*\(/.test(src),
    `${id}.js has no systemPrompt construction`
  );
  assert(!/buildRoutingPrompt/.test(src), `${id}.js has no routing builder`);
  assert(
    !/export function buildRoutingPrompt/.test(src),
    `${id}.js has no routing export`
  );
}

const ls = new Map();
global.localStorage = {
  getItem: (key) => (ls.has(key) ? ls.get(key) : null),
  setItem: (key, value) => ls.set(key, value),
  removeItem: (key) => ls.delete(key),
  clear: () => ls.clear(),
};
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, "crypto", {
    value: { randomUUID },
    configurable: true,
  });
}

const userId = "test-user";

async function runIsolationTests() {
  localStorage.clear();

  setActiveBusiness("iron-city-cargo");
  await addMemoryFact(userId, "ICC-only fact", null, "iron-city-cargo");
  await createChat(userId, "ICC chat", "iron-city-cargo");

  setActiveBusiness("taniva");
  await addMemoryFact(userId, "Taniva-only fact", null, "taniva");
  await createChat(userId, "Taniva chat", "taniva");

  setActiveBusiness("iron-city-cargo");
  const iccMemory = await getMemory(userId, "iron-city-cargo");
  const iccChats = await getChats(userId, "iron-city-cargo");

  setActiveBusiness("taniva");
  const tanivaMemory = await getMemory(userId, "taniva");
  const tanivaChats = await getChats(userId, "taniva");

  assert(
    iccMemory.some((r) => r.fact === "ICC-only fact"),
    "ICC memory contains ICC fact"
  );
  assert(
    !tanivaMemory.some((r) => r.fact === "ICC-only fact"),
    "Taniva memory does not contain ICC fact"
  );
  assert(
    tanivaMemory.some((r) => r.fact === "Taniva-only fact"),
    "Taniva memory contains Taniva fact"
  );
  assert(
    iccChats.some((c) => c.title === "ICC chat"),
    "ICC chat history contains ICC chat"
  );
  assert(
    !tanivaChats.some((c) => c.title === "ICC chat"),
    "Taniva chat history does not contain ICC chat"
  );
  assert(
    tanivaChats.some((c) => c.title === "Taniva chat"),
    "Taniva chat history contains Taniva chat"
  );

  assert(
    localStorage.getItem(memoryFactsStorageKey("iron-city-cargo")) !==
      localStorage.getItem(memoryFactsStorageKey("taniva")),
    "memory localStorage keys are distinct"
  );
  assert(
    localStorage.getItem(chatHistoryStorageKey("iron-city-cargo")) !==
      localStorage.getItem(chatHistoryStorageKey("taniva")),
    "chat localStorage keys are distinct"
  );
}

async function runDocumentMetadataMigrationTest() {
  localStorage.clear();
  localStorage.setItem(
    "docs_meta_surine-advisors",
    JSON.stringify([
      {
        docId: "doc_surine-advisors_1000000001",
        businessId: "surine-advisors",
        name: "Legacy plan.pdf",
        tags: ["all"],
        storageKind: "pdf",
        updatedAt: "2020-01-01T00:00:00.000Z",
      },
    ])
  );
  localStorage.setItem(
    docMetaStorageKey("hawthorne-legacy"),
    JSON.stringify([
      {
        docId: "doc_hawthorne-legacy_1000000002",
        businessId: "hawthorne-legacy",
        name: "Existing.docx",
        tags: ["all"],
        storageKind: "document",
        updatedAt: "2021-01-01T00:00:00.000Z",
      },
    ])
  );

  await initDocumentDB();
  const first = await migrateDocumentMetadataV2();
  assert(first.pairwiseAdded >= 1, "v2 merges surine metadata into hawthorne-legacy");

  const hawthorneRaw = localStorage.getItem(docMetaStorageKey("hawthorne-legacy"));
  assert(hawthorneRaw?.includes("doc_surine-advisors_1000000001"), "surine doc merged");
  assert(hawthorneRaw?.includes("doc_hawthorne-legacy_1000000002"), "existing hawthorne doc kept");
  assert(
    localStorage.getItem("docs_meta_surine-advisors")?.includes("doc_surine-advisors"),
    "v2 does not delete source metadata key"
  );
  assert(
    localStorage.getItem("migration_docs_v2_done") === "true",
    "migration_docs_v2_done flag set"
  );

  const second = await migrateDocumentMetadataV2();
  assert(second.skipped === true, "v2 migration runs only once");
}

async function runMigrationTest() {
  localStorage.clear();

  const legacyChat = JSON.stringify({
    chats: [{ id: "legacy-1", title: "Legacy chat", updated_at: "2020-01-01" }],
    messages: { "legacy-1": [] },
  });
  localStorage.setItem("chatHistory", legacyChat);
  localStorage.setItem(
    chatHistoryStorageKey("iron-city-cargo"),
    JSON.stringify({ chats: [{ id: "new-1", title: "New chat" }], messages: {} })
  );

  migrateOldData();
  assert(
    localStorage.getItem(chatHistoryStorageKey("iron-city-cargo")).includes("New chat"),
    "migration does not overwrite existing scoped chat data"
  );
  assert(
    localStorage.getItem("migration_v1_done") === "true",
    "migration sets migration_v1_done flag"
  );

  localStorage.setItem("chatHistory", JSON.stringify({ chats: [], messages: {} }));
  migrateOldData();
  assert(
    localStorage.getItem(chatHistoryStorageKey("iron-city-cargo")).includes("New chat"),
    "migration runs only once and never re-applies"
  );
}

async function runBusinessSwitchTest() {
  const ids = ["iron-city-cargo", "taniva", "hawthorne-legacy", "iron-city-cargo"];
  const errors = [];

  for (const id of ids) {
    try {
      setActiveBusiness(id);
      const biz = getActiveBusiness();
      assert(biz.id === id, `getActiveBusiness returns ${id}`);

      await REID.buildContext([], biz, { textBlocks: "", mediaBlocks: [] });
      await LEO.buildContext([], biz, { textBlocks: "", mediaBlocks: [] });
      await MASON.buildContext([], biz, { textBlocks: "", mediaBlocks: [] });
      buildRoutingPrompt(biz);
    } catch (err) {
      errors.push({ id, err });
    }
  }

  assert(errors.length === 0, `business switch produced no errors (${errors.length} errors)`);
  if (errors.length) {
    console.error(errors);
  }
}

await runIsolationTests();
await runDocumentMetadataMigrationTest();
await runMigrationTest();
await runBusinessSwitchTest();

console.log("\nDone.", failed ? `${failed} failure(s)` : "All checks passed.");
process.exit(failed ? 1 : 0);
