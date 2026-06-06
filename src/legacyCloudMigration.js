/**
 * Manual one-time migration: local IndexedDB + docs_meta_* / memoryFacts_* → Supabase.
 * Not run on app load — invoke from dev/admin UI only.
 */

import {
  getFileRecordByDocId,
  initDocumentDB,
  listAllFileRecords,
  parseBusinessIdFromDocId,
  readDocumentMetadataList,
} from "../documents/documentStore.js";

function logMigrationBanner(kind) {
  console.info(
    `[migration] Starting manual ${kind} migration → Supabase (local data is not deleted).`
  );
}

/** localhost / 127.0.0.1, or production with ?legacyMigration=1 */
export function isLegacyMigrationAllowed() {
  if (typeof window === "undefined") return false;

  const isLocalhost =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  const params = new URLSearchParams(window.location.search);
  const enabledByQuery = params.get("legacyMigration") === "1";

  return isLocalhost || enabledByQuery;
}

function listDocsMetaKeys() {
  const keys = [];
  if (typeof localStorage === "undefined") return keys;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("docs_meta_")) keys.push(key);
  }
  return keys.sort();
}

function listMemoryFactsKeys() {
  const keys = [];
  if (typeof localStorage === "undefined") return keys;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("memoryFacts_")) keys.push(key);
  }
  return keys.sort();
}

function scopeIdFromDocsMetaKey(key) {
  return key.slice("docs_meta_".length);
}

function scopeIdFromMemoryKey(key) {
  return key.slice("memoryFacts_".length);
}

function normalizeMetaRow(row, scopeId) {
  return {
    docId: row.docId,
    businessId: row.businessId ?? scopeId,
    name: row.name ?? row.docId,
    type: row.type ?? row.mimeType ?? "",
    description: row.description ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    storageKind: row.storageKind ?? "markdown",
    size: row.size ?? null,
    mimeType: row.mimeType ?? row.type ?? "",
    rowCount: row.rowCount ?? null,
    createdAt: row.createdAt ?? row.updatedAt ?? new Date().toISOString(),
    updatedAt: row.updatedAt ?? row.createdAt ?? new Date().toISOString(),
  };
}

/**
 * Scan docs_meta_* + IndexedDB icc_documents and upload missing rows to Supabase.
 * @param {string} userId - signed-in user (must match cloud document user)
 */
export async function migrateLegacyDocumentsToSupabase(userId) {
  if (!userId) {
    throw new Error("Sign in required before migrating documents.");
  }
  if (!isLegacyMigrationAllowed()) {
    throw new Error(
      "Document migration is only available on localhost or with ?legacyMigration=1."
    );
  }

  logMigrationBanner("documents");

  const cloud = await import("../documents/cloudDocumentStore.js");
  cloud.setCloudDocumentUser(userId);

  await initDocumentDB();

  const report = {
    docsMetaKeys: [],
    attempted: 0,
    migrated: 0,
    skippedDuplicate: 0,
    failed: [],
  };

  const docsMetaKeys = listDocsMetaKeys();
  report.docsMetaKeys = docsMetaKeys;
  console.log("[migration:documents] docs_meta keys found:", docsMetaKeys);

  const indexedRecords = await listAllFileRecords();
  const recordsByDocId = new Map(
    indexedRecords.filter((r) => r?.docId).map((r) => [r.docId, r])
  );

  const seenDocIds = new Set();

  for (const metaKey of docsMetaKeys) {
    const scopeId = scopeIdFromDocsMetaKey(metaKey);
    let rows = readDocumentMetadataList(scopeId);

    if (!rows.length) {
      try {
        const parsed = JSON.parse(localStorage.getItem(metaKey) ?? "[]");
        rows = Array.isArray(parsed) ? parsed : [];
      } catch {
        rows = [];
      }
    }

    for (const raw of rows) {
      if (!raw?.docId) continue;
      report.attempted += 1;

      const meta = normalizeMetaRow(raw, scopeId);
      const label = `${meta.docId} (${scopeId})`;

      try {
        if (seenDocIds.has(meta.docId)) {
          report.skippedDuplicate += 1;
          console.log("[migration:documents] skip duplicate docId (batch)", label);
          continue;
        }
        seenDocIds.add(meta.docId);

        const existingById = await cloud.cloudFindDocumentByDocId(meta.docId);
        if (existingById) {
          report.skippedDuplicate += 1;
          console.log("[migration:documents] skip duplicate docId (cloud)", label);
          continue;
        }

        const existingByName = await cloud.cloudFindDocumentByScopeNameCreated(
          scopeId,
          meta.name,
          meta.createdAt
        );
        if (existingByName) {
          report.skippedDuplicate += 1;
          console.log(
            "[migration:documents] skip duplicate scope+name+createdAt",
            label,
            meta.name
          );
          continue;
        }

        let fileRecord = recordsByDocId.get(meta.docId);
        if (!fileRecord) {
          fileRecord = await getFileRecordByDocId(meta.docId);
        }

        if (!fileRecord?.payload) {
          report.failed.push({
            docId: meta.docId,
            scopeId,
            reason: "No IndexedDB payload for docId",
          });
          console.warn("[migration:documents] failed:", label, "no IndexedDB payload");
          continue;
        }

        const stored = {
          docId: meta.docId,
          businessId: scopeId,
          storageKind: fileRecord.storageKind ?? meta.storageKind,
          mimeType: fileRecord.mimeType ?? meta.mimeType,
          size: fileRecord.size ?? meta.size,
          payload: fileRecord.payload,
          updatedAt: fileRecord.updatedAt ?? meta.updatedAt,
        };

        await cloud.cloudSaveDocument(meta.businessId, stored, meta);
        report.migrated += 1;
        console.log("[migration:documents] migrated", label, meta.name);
      } catch (err) {
        report.failed.push({
          docId: raw.docId,
          scopeId,
          reason: err.message ?? String(err),
        });
        console.error("[migration:documents] failed:", label, err);
      }
    }
  }

  // Orphan IndexedDB rows with metadata in another key or missing from lists
  for (const fileRecord of indexedRecords) {
    if (!fileRecord?.docId || seenDocIds.has(fileRecord.docId)) continue;

    const scopeId =
      fileRecord.businessId ?? parseBusinessIdFromDocId(fileRecord.docId);
    if (!scopeId) continue;

    report.attempted += 1;
    const meta = normalizeMetaRow(
      metadataFromFileRecord(fileRecord, scopeId) ?? {
        docId: fileRecord.docId,
        businessId: scopeId,
        name: fileRecord.docId,
      },
      scopeId
    );

    try {
      const existingById = await cloud.cloudFindDocumentByDocId(meta.docId);
      if (existingById) {
        report.skippedDuplicate += 1;
        seenDocIds.add(meta.docId);
        continue;
      }

      await cloud.cloudSaveDocument(
        scopeId,
        {
          docId: meta.docId,
          businessId: scopeId,
          storageKind: fileRecord.storageKind,
          mimeType: fileRecord.mimeType,
          size: fileRecord.size,
          payload: fileRecord.payload,
          updatedAt: fileRecord.updatedAt,
        },
        meta
      );
      report.migrated += 1;
      seenDocIds.add(meta.docId);
      console.log("[migration:documents] migrated orphan IndexedDB", meta.docId);
    } catch (err) {
      report.failed.push({
        docId: fileRecord.docId,
        scopeId,
        reason: err.message ?? String(err),
      });
    }
  }

  console.log("[migration:documents] complete", report);
  return report;
}

function metadataFromFileRecord(record, scopeId) {
  if (!record?.docId) return null;
  return normalizeMetaRow(
    {
      docId: record.docId,
      businessId: scopeId,
      name: record.name ?? record.docId,
      type: record.mimeType ?? "",
      tags: [],
      storageKind: record.storageKind,
      size: record.size,
      mimeType: record.mimeType,
      createdAt: record.updatedAt,
      updatedAt: record.updatedAt,
    },
    scopeId
  );
}

/**
 * Scan memoryFacts_* and upsert into Supabase memory table.
 */
export async function migrateLegacyMemoryToSupabase(userId) {
  if (!userId) {
    throw new Error("Sign in required before migrating memory.");
  }
  if (!isLegacyMigrationAllowed()) {
    throw new Error(
      "Memory migration is only available on localhost or with ?legacyMigration=1."
    );
  }

  logMigrationBanner("memory");

  const cloud = await import("./cloudMemoryStore.js");
  cloud.setCloudMemoryUser(userId);

  const report = {
    memoryFactsKeys: [],
    attempted: 0,
    migrated: 0,
    skippedDuplicate: 0,
    failed: [],
  };

  const memoryKeys = listMemoryFactsKeys();
  report.memoryFactsKeys = memoryKeys;
  console.log("[migration:memory] memoryFacts keys found:", memoryKeys);

  for (const metaKey of memoryKeys) {
    const scopeId = scopeIdFromMemoryKey(metaKey);
    let rows = [];

    try {
      const parsed = JSON.parse(localStorage.getItem(metaKey) ?? "[]");
      rows = Array.isArray(parsed) ? parsed : [];
    } catch {
      continue;
    }

    for (const row of rows) {
      if (!row?.fact || typeof row.fact !== "string") continue;
      report.attempted += 1;

      const factText = row.fact.trim();
      const factId = row.id ?? crypto.randomUUID();
      const label = `${scopeId}: ${factText.slice(0, 60)}`;

      try {
        if (row.id) {
          const byId = await cloud.cloudFindMemoryById(scopeId, row.id);
          if (byId) {
            report.skippedDuplicate += 1;
            console.log("[migration:memory] skip duplicate id", label);
            continue;
          }
        }

        const byFact = await cloud.cloudFindMemoryByScopeFact(scopeId, factText);
        if (byFact) {
          report.skippedDuplicate += 1;
          console.log("[migration:memory] skip duplicate scope+fact", label);
          continue;
        }

        await cloud.cloudInsertMemoryFact(scopeId, {
          id: factId,
          user_id: userId,
          agent: row.agent ?? "shared",
          fact: factText,
          category: row.category ?? null,
          created_at: row.created_at ?? new Date().toISOString(),
        });

        report.migrated += 1;
        console.log("[migration:memory] migrated", label);
      } catch (err) {
        report.failed.push({
          scopeId,
          fact: factText.slice(0, 80),
          reason: err.message ?? String(err),
        });
        console.error("[migration:memory] failed:", label, err);
      }
    }
  }

  console.log("[migration:memory] complete", report);
  return report;
}
