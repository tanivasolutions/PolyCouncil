import { getActiveModule } from "../src/modules/index.js";

export const DOC_MAX_BYTES = 25 * 1024 * 1024;

export const DOC_ACCEPT_INPUT =
  ".md,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const DOC_TAG_OPTIONS = [
  "financial",
  "operations",
  "market",
  "strategy",
  "compliance",
  "carriers",
  "rates",
  "pipeline",
  "process",
  "all",
];

const EXTENSIONS = new Set([
  ".md",
  ".pdf",
  ".doc",
  ".docx",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".xlsx",
  ".csv",
]);

export function getExtension(filename) {
  const match = String(filename ?? "").match(/(\.[^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const TAG_KEYWORD_RULES = [
  {
    tag: "financial",
    keywords: [
      "cash",
      "revenue",
      "profit",
      "expense",
      "invoice",
      "premium",
      "commission",
    ],
  },
  {
    tag: "operations",
    keywords: [
      "driver",
      "truck",
      "vehicle",
      "route",
      "compliance",
      "cdl",
      "carrier",
      "appointment",
    ],
  },
  {
    tag: "market",
    keywords: [
      "market",
      "competitor",
      "opportunity",
      "growth",
      "segment",
      "expansion",
    ],
  },
  {
    tag: "strategy",
    keywords: [
      "market",
      "competitor",
      "opportunity",
      "growth",
      "segment",
      "expansion",
    ],
  },
  {
    tag: "rates",
    keywords: ["rate", "pricing", "plan", "premium", "contract"],
  },
  {
    tag: "compliance",
    keywords: ["medicare", "aep", "medicaid", "enrollment", "certification"],
  },
];

function containsKeyword(haystack, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

export function isImageDocumentFile(file) {
  return IMAGE_EXTENSIONS.has(getExtension(file?.name));
}

export function getScanTextForTags(processed, file) {
  if (!processed || processed.type === "image") {
    return "";
  }

  if (processed.type === "markdown" || processed.type === "document") {
    return String(processed.content ?? processed.preview ?? "").slice(0, 500);
  }

  if (processed.type === "spreadsheet") {
    return `${processed.summary ?? ""}\n${processed.preview ?? ""}`.slice(0, 500);
  }

  if (processed.type === "pdf") {
    return `${file?.name ?? ""} ${processed.preview ?? ""}`.slice(0, 500);
  }

  return String(processed.preview ?? "").slice(0, 500);
}

export function suggestTagsFromText(text) {
  const haystack = String(text ?? "").toLowerCase();
  if (!haystack.trim()) {
    return [];
  }

  const suggested = new Set();
  for (const { tag, keywords } of TAG_KEYWORD_RULES) {
    if (!getActiveDocTagOptions().includes(tag)) {
      continue;
    }
    if (keywords.some((keyword) => containsKeyword(haystack, keyword))) {
      suggested.add(tag);
    }
  }

  return [...suggested];
}

export function validateDocumentFile(file) {
  if (!file) {
    return "No file selected.";
  }

  if (file.size > DOC_MAX_BYTES) {
    return "File exceeds the 25MB limit.";
  }

  const ext = getExtension(file.name);
  if (!EXTENSIONS.has(ext)) {
    return "Unsupported file type. Use .md, .pdf, .doc, .docx, .png, .jpg, .xlsx, or .csv.";
  }

  return null;
}

export function getDocumentTypeIcon(metadata) {
  const kind = metadata?.storageKind ?? "";
  const ext = getExtension(metadata?.name);

  if (kind === "markdown" || ext === ".md") return "📝";
  if (kind === "document" || ext === ".doc" || ext === ".docx") return "📃";
  if (kind === "csv" || ext === ".csv") return "📝";
  if (kind === "pdf" || ext === ".pdf") return "📄";
  if (kind === "image" || [".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    return "🖼️";
  }
  if (kind === "spreadsheet" || kind === "xlsx" || kind === "csv" || ext === ".xlsx" || ext === ".csv") {
    return "📊";
  }
  return "📎";
}

export function formatDocumentDate(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function spreadsheetPreviewText(content, maxLength = 300) {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content.length <= maxLength
      ? content
      : `${content.slice(0, maxLength)}…`;
  }

  if (content.preview) {
    const text = String(content.preview);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
  }

  if (content.summary) {
    const text = String(content.summary);
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
  }

  const sheetNames = Object.keys(content);
  if (!sheetNames.length) {
    return "(empty spreadsheet)";
  }

  const rows = content[sheetNames[0]];
  if (!Array.isArray(rows) || !rows.length) {
    return "(empty spreadsheet)";
  }

  const text = JSON.stringify(rows.slice(0, 3), null, 2);
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

export function estimatePdfPageCount(base64) {
  try {
    const binary = atob(base64);
    const countMatch = binary.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
    if (countMatch) {
      return parseInt(countMatch[1], 10);
    }
    const pageMatches = binary.match(/\/Type\s*\/Page\b/g);
    return pageMatches?.length ?? null;
  } catch {
    return null;
  }
}

/** Tag options for the active module; falls back to business defaults. */
export function getActiveDocTagOptions() {
  if (typeof window !== "undefined" && window.__activeModule?.docTagOptions) {
    return window.__activeModule.docTagOptions;
  }
  const mod = getActiveModule();
  if (mod?.docTagOptions) return mod.docTagOptions;
  return DOC_TAG_OPTIONS;
}
