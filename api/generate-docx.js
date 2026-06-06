import {
  buildDocxBuffer,
  extractAssistantText,
} from "../lib/docx-builder.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { content, prompt, context, response } = req.body ?? {};

    let documentText = content?.trim();
    if (!documentText && response) {
      documentText = extractAssistantText(response);
    }
    if (!documentText) {
      documentText = [context, prompt].filter(Boolean).join("\n\n").trim();
    }

    if (!documentText) {
      return res.status(400).json({ error: "No content to export" });
    }

    const buffer = await buildDocxBuffer(documentText);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="polycouncil-export.docx"'
    );
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
