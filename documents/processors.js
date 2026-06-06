import mammoth from "mammoth";
import {
  buildSpreadsheetRepresentations,
  readFileAsArrayBuffer,
} from "./spreadsheet.js";

const DOC_FALLBACK_CONTENT =
  "[.doc format — content could not be extracted. Consider saving as .docx for full support.]";
const DOC_FALLBACK_PREVIEW = "[.doc file — limited support]";

function getExtension(filename) {
  const match = String(filename ?? "").match(/(\.[^.]+)$/i);
  return match ? match[1].toLowerCase() : "";
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function previewText(text, maxLength = 200) {
  const raw = String(text ?? "");
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength)}…`;
}

export async function processMd(file) {
  const rawText = await readFileAsText(file);
  return {
    type: "markdown",
    content: rawText,
    preview: previewText(rawText, 200),
  };
}

export async function processPdf(file) {
  const buffer = await readFileAsArrayBuffer(file);
  const base64String = arrayBufferToBase64(buffer);
  const filename = file.name ?? "document.pdf";

  return {
    type: "pdf",
    content: base64String,
    preview: `PDF document — ${filename}`,
  };
}

export async function processImage(file) {
  const base64DataUrl = await readFileAsDataURL(file);
  const filename = file.name ?? "image";

  return {
    type: "image",
    content: base64DataUrl,
    mimeType: file.type ?? "",
    preview: `Image — ${filename}`,
  };
}

export async function processDocx(file) {
  const ext = getExtension(file.name);
  const arrayBuffer = await readFileAsArrayBuffer(file);

  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = String(result.value ?? "").trim();

    return {
      type: "document",
      content: text,
      preview: previewText(text, 200),
    };
  } catch (error) {
    if (ext === ".doc") {
      return {
        type: "document",
        content: DOC_FALLBACK_CONTENT,
        preview: DOC_FALLBACK_PREVIEW,
      };
    }
    throw error;
  }
}

export async function processSpreadsheet(file) {
  const { summary, preview, full, rowCount } =
    await buildSpreadsheetRepresentations(file);

  return {
    type: "spreadsheet",
    summary,
    preview,
    full,
    rowCount,
    sheets: full,
  };
}

export async function processFile(file) {
  if (!file) {
    throw new Error("Unsupported file type");
  }

  const ext = getExtension(file.name);

  switch (ext) {
    case ".md":
    case ".txt":
      return processMd(file);
    case ".doc":
    case ".docx":
      return processDocx(file);
    case ".pdf":
      return processPdf(file);
    case ".png":
    case ".jpg":
    case ".jpeg":
    case ".webp":
      return processImage(file);
    case ".xlsx":
    case ".xls":
    case ".csv":
      return processSpreadsheet(file);
    default:
      throw new Error("Unsupported file type");
  }
}
