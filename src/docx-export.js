import { buildDocxBlob } from "../lib/docx-builder.js";

export { extractAssistantText } from "../lib/docx-builder.js";

export async function generateWordDownload(documentText, filename) {
  const blob = await buildDocxBlob(documentText);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".docx") ? filename : `${filename}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
