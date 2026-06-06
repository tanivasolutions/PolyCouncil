import { supabase } from "../src/supabase.js";

const BUCKET = "agent-documents";
const TABLE = "agent_documents";

let cloudUserId = null;

export function setCloudDocumentUser(userId) {
  cloudUserId = userId ?? null;
}

export function isCloudDocumentsEnabled() {
  return Boolean(cloudUserId);
}

function cloudSyncFlagKey(userId) {
  return `pc-migration-docs-cloud-${userId}-done`;
}

export function storagePathForDoc(userId, scopeId, docId) {
  return `${userId}/${scopeId}/${docId}.json`;
}

function rowToMetadata(row) {
  return {
    docId: row.doc_id,
    businessId: row.scope_id,
    name: row.name,
    type: row.mime_type ?? "",
    description: row.description ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    storageKind: row.storage_kind,
    size: row.size ?? null,
    mimeType: row.mime_type ?? "",
    rowCount: row.row_count ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cloud: true,
  };
}

function metadataToRow(meta, userId, storagePath) {
  const createdAt = meta.createdAt ?? meta.updatedAt ?? new Date().toISOString();
  const updatedAt = meta.updatedAt ?? createdAt;
  return {
    user_id: userId,
    doc_id: meta.docId,
    scope_id: meta.businessId,
    name: meta.name,
    description: meta.description ?? "",
    tags: meta.tags ?? [],
    storage_kind: meta.storageKind,
    mime_type: meta.mimeType ?? meta.type ?? "",
    size: meta.size ?? null,
    row_count: meta.rowCount ?? null,
    storage_path: storagePath,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export async function cloudFindDocumentByDocId(docId) {
  if (!cloudUserId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("doc_id, scope_id, name, created_at")
    .eq("user_id", cloudUserId)
    .eq("doc_id", docId)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to query document");
  return data;
}

export async function cloudFindDocumentByScopeNameCreated(
  scopeId,
  name,
  createdAt
) {
  if (!cloudUserId) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("doc_id, scope_id, name, created_at")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .eq("name", name)
    .eq("created_at", createdAt)
    .maybeSingle();
  if (error) throw new Error(error.message ?? "Failed to query document");
  return data;
}

export async function cloudListDocuments(scopeId) {
  if (!cloudUserId) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", cloudUserId)
    .eq("scope_id", scopeId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message ?? "Failed to list cloud documents");
  }

  return (data ?? []).map(rowToMetadata);
}

export async function cloudSaveDocument(scopeId, fileRecord, meta) {
  if (!cloudUserId) {
    throw new Error("Cloud documents require a signed-in user");
  }

  const storagePath = storagePathForDoc(cloudUserId, scopeId, meta.docId);
  const envelope = {
    docId: meta.docId,
    businessId: scopeId,
    storageKind: fileRecord.storageKind,
    mimeType: fileRecord.mimeType,
    size: fileRecord.size,
    payload: fileRecord.payload,
    updatedAt: fileRecord.updatedAt,
  };

  const blob = new Blob([JSON.stringify(envelope)], {
    type: "application/json",
  });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      upsert: true,
      contentType: "application/json",
    });

  if (uploadError) {
    throw new Error(uploadError.message ?? "Failed to upload document file");
  }

  const row = metadataToRow(meta, cloudUserId, storagePath);
  const { error: upsertError } = await supabase.from(TABLE).upsert(row, {
    onConflict: "user_id,doc_id",
  });

  if (upsertError) {
    throw new Error(upsertError.message ?? "Failed to save document metadata");
  }

  console.log("[documents] Saved to cloud", {
    scopeId,
    docId: meta.docId,
    storagePath,
  });

  return meta.docId;
}

export async function cloudGetDocument(docId, scopeHint = null) {
  if (!cloudUserId) {
    throw new Error("Cloud documents require a signed-in user");
  }

  let query = supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", cloudUserId)
    .eq("doc_id", docId);

  if (scopeHint) {
    query = query.eq("scope_id", scopeHint);
  }

  const { data: rows, error } = await query.limit(1);

  if (error) {
    throw new Error(error.message ?? "Failed to load document metadata");
  }

  const row = rows?.[0];
  if (!row) {
    throw new Error(`Document not found in cloud: ${docId}`);
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(row.storage_path);

  if (downloadError) {
    throw new Error(downloadError.message ?? "Failed to download document file");
  }

  const envelope = JSON.parse(await fileBlob.text());
  const metadata = rowToMetadata(row);

  return {
    content: envelope.payload,
    metadata,
  };
}

export async function cloudDeleteDocument(scopeId, docId) {
  if (!cloudUserId) return;

  const storagePath = storagePathForDoc(cloudUserId, scopeId, docId);

  await supabase.storage.from(BUCKET).remove([storagePath]);

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", cloudUserId)
    .eq("doc_id", docId)
    .eq("scope_id", scopeId);

  if (error) {
    throw new Error(error.message ?? "Failed to delete cloud document");
  }
}

/**
 * Upload local IndexedDB documents to cloud once per user (browser).
 */
export async function syncLocalDocumentsToCloud({
  listAllFileRecords,
  readDocumentMetadataList,
  parseBusinessIdFromDocId,
}) {
  if (!cloudUserId || typeof localStorage === "undefined") {
    return { skipped: true, reason: "no cloud user" };
  }

  const flagKey = cloudSyncFlagKey(cloudUserId);
  if (localStorage.getItem(flagKey)) {
    return { skipped: true, reason: "already synced" };
  }

  const records = await listAllFileRecords();
  const uploaded = new Set();
  let count = 0;

  for (const record of records) {
    const scopeId =
      record.businessId ?? parseBusinessIdFromDocId(record.docId);
    if (!scopeId || !record.docId || uploaded.has(record.docId)) continue;

    const metaList = readDocumentMetadataList(scopeId);
    const meta =
      metaList.find((row) => row.docId === record.docId) ?? {
        docId: record.docId,
        businessId: scopeId,
        name: record.name ?? record.docId,
        type: record.mimeType ?? "",
        description: "",
        tags: [],
        storageKind: record.storageKind,
        size: record.size,
        mimeType: record.mimeType ?? "",
        rowCount: record.payload?.rowCount ?? null,
        createdAt: record.updatedAt,
        updatedAt: record.updatedAt,
      };

    try {
      const { data: existing } = await supabase
        .from(TABLE)
        .select("doc_id")
        .eq("user_id", cloudUserId)
        .eq("doc_id", record.docId)
        .maybeSingle();

      if (!existing) {
        await cloudSaveDocument(scopeId, record, meta);
        count += 1;
      }
      uploaded.add(record.docId);
    } catch (err) {
      console.warn(`[documents] Cloud sync failed for ${record.docId}:`, err);
    }
  }

  localStorage.setItem(flagKey, "true");
  console.log("[documents] Local → cloud sync complete", { uploaded: count });
  return { uploaded: count };
}
