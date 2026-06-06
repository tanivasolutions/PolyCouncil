export const MAX_ATTACHMENTS = 5;

export const ACCEPTED_FILE_INPUT =
  ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.txt,.md,.csv,.xlsx,.xls,image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,text/markdown,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv"]);
const BINARY_OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx"]);
const PDF_EXTENSIONS = new Set(["pdf"]);

const FINANCIAL_KEYWORDS =
  /\b(cash|margin|revenue|budget|financial|p&l|profit|runway|forecast|expense|invoice|ar|ap|factoring)\b/i;
const COMPLIANCE_KEYWORDS =
  /\b(compliance|inspection|hos|dot|credential|paperwork|permit|license|maintenance|fleet|driver)\b/i;

export function getFileExtension(filename) {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() : "";
}

export function isUspsSolicitation(filename) {
  return /hcr|solicitation|usps|ps7435/i.test(filename);
}

export function getFileCategory(filename, mimeType = "") {
  const ext = getFileExtension(filename);
  if (IMAGE_EXTENSIONS.has(ext) || mimeType.startsWith("image/")) return "image";
  if (PDF_EXTENSIONS.has(ext) || mimeType === "application/pdf") return "pdf";
  if (ext === "csv" || mimeType.includes("csv")) return "csv";
  if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith("text/")) return "text";
  if (BINARY_OFFICE_EXTENSIONS.has(ext)) return "office";
  return "document";
}

export function isAcceptedFile(file) {
  const ext = getFileExtension(file.name);
  const accepted = new Set([
    ...IMAGE_EXTENSIONS,
    ...PDF_EXTENSIONS,
    ...TEXT_EXTENSIONS,
    ...BINARY_OFFICE_EXTENSIONS,
  ]);
  return accepted.has(ext);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getAutoPlaceholder(files) {
  if (files.some((file) => isUspsSolicitation(file.name))) {
    return "Please run the full USPS bid analysis on this solicitation.";
  }

  const categories = files.map((file) =>
    getFileCategory(file.name, file.type)
  );

  if (categories.some((category) => category === "pdf")) {
    return "Please analyze this document.";
  }
  if (categories.some((category) => category === "csv" || category === "office")) {
    return "Please analyze this data.";
  }
  if (categories.every((category) => category === "image")) {
    return "Please analyze this image.";
  }

  return "Please analyze the attached file(s).";
}

export function applyUspsFastTrack(text, files) {
  if (!files.some((file) => isUspsSolicitation(file.name))) {
    return text;
  }

  const prefix =
    "@Mason — USPS solicitation attached. Please run the full bid analysis per your USPS bid analysis skill.";

  if (text?.trim()) {
    return `${prefix}\n\n${text.trim()}`;
  }

  return prefix;
}

export function routeFromFiles(files, messageText = "") {
  const names = files.map((file) => file.name).join(" ");
  const combined = `${messageText} ${names}`;

  if (files.some((file) => isUspsSolicitation(file.name))) {
    return "mason";
  }

  const hasDataFile = files.some((file) => {
    const category = getFileCategory(file.name, file.type);
    return category === "csv" || category === "office";
  });

  if (hasDataFile && FINANCIAL_KEYWORDS.test(combined)) {
    return "reid";
  }

  const hasImage = files.some(
    (file) => getFileCategory(file.name, file.type) === "image"
  );

  if (hasImage && COMPLIANCE_KEYWORDS.test(combined)) {
    return "leo";
  }

  const hasPdf = files.some(
    (file) => getFileCategory(file.name, file.type) === "pdf"
  );

  if (hasPdf && !messageText.trim()) {
    return "mason";
  }

  return null;
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function getImageMimeType(file) {
  const ext = getFileExtension(file.name);
  const map = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return file.type || map[ext] || "image/jpeg";
}

export async function fileToApiBlock(file) {
  const category = getFileCategory(file.name, file.type);

  if (category === "image") {
    const base64 = await readFileAsBase64(file);
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: getImageMimeType(file),
        data: base64,
      },
    };
  }

  if (category === "pdf") {
    const base64 = await readFileAsBase64(file);
    return {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: base64,
      },
    };
  }

  if (category === "office") {
    throw new Error(
      `${file.name} is a binary Office file. Please convert it to PDF or CSV before uploading.`
    );
  }

  const text = await readFileAsText(file);
  return {
    type: "text",
    text: `File: ${file.name}\n\n${text}`,
  };
}

export async function buildUserApiContent(text, files) {
  const blocks = [];

  if (text?.trim()) {
    blocks.push({ type: "text", text: text.trim() });
  }

  for (const file of files) {
    blocks.push(await fileToApiBlock(file));
  }

  if (blocks.length === 1 && blocks[0].type === "text") {
    return blocks[0].text;
  }

  return blocks;
}

export function buildAttachmentMetadata(files) {
  return files.map((file) => ({
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    category: getFileCategory(file.name, file.type),
  }));
}

export function buildRoutingDescription(messageText, files) {
  if (!files.length) return messageText;

  const fileSummary = files
    .map((file) => {
      const category = getFileCategory(file.name, file.type);
      return `${file.name} (${category})`;
    })
    .join(", ");

  return `${messageText || "(no message text)"}\n\nAttached files: ${fileSummary}`;
}
