const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages?beta=true";

const SKILLS_BETAS = [
  "code-execution-2025-08-25",
  "skills-2025-10-02",
  "files-api-2025-04-14",
];

function getApiKey() {
  const key =
    process.env.ANTHROPIC_API_KEY || process.env.VITE_ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not configured. Add it to .env.local or Vercel environment variables."
    );
  }
  return key;
}

const SKILL_EXPORT_INSTRUCTIONS = {
  xlsx:
    "Create a complete Excel workbook (.xlsx) from this content. Include all tables and structured data. When finished, export the file so it can be downloaded.",
  docx:
    "Create a complete Word document (.docx) from this content. Include all tables and structured data with clean formatting. When finished, export the file so it can be downloaded.",
};

const MAX_CONTEXT_CHARS = 12000;

export function buildUserMessage(prompt, context, skillId) {
  const trimmedPrompt = prompt?.trim();
  if (!trimmedPrompt) {
    throw new Error("prompt is required");
  }

  const exportInstruction = SKILL_EXPORT_INSTRUCTIONS[skillId] ?? "";
  let message = exportInstruction
    ? `${exportInstruction}\n\n${trimmedPrompt}`
    : trimmedPrompt;

  const trimmedContext = context?.trim();
  if (trimmedContext) {
    const truncatedContext =
      trimmedContext.length > MAX_CONTEXT_CHARS
        ? `${trimmedContext.slice(0, MAX_CONTEXT_CHARS)}\n\n[Context truncated for length]`
        : trimmedContext;
    message += `\n\n---\nConversation context (for reference):\n${truncatedContext}`;
  }

  return message;
}

export function extractFileIds(value, ids = []) {
  if (!value || typeof value !== "object") {
    return ids;
  }

  if (typeof value.file_id === "string") {
    ids.push(value.file_id);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      extractFileIds(item, ids);
    }
    return ids;
  }

  for (const nested of Object.values(value)) {
    extractFileIds(nested, ids);
  }

  return ids;
}

export class SkillFileExtractionError extends Error {
  constructor(message, fullResponse) {
    super(message);
    this.name = "SkillFileExtractionError";
    this.fullResponse = fullResponse;
  }
}

function contentBlocks(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function extractFileIdFromResponse(data) {
  const content = data.content || [];

  // Pattern 1 — direct file block
  let fileId = content.find((b) => b.type === "file")?.file_id;

  // Pattern 2 — inside tool_result
  if (!fileId) {
    const toolResult = content.find((b) => b.type === "tool_result");
    const inner = contentBlocks(toolResult?.content);
    fileId =
      inner.find((b) => b?.file_id)?.file_id ||
      inner.find((b) => b?.type === "file")?.file_id;

    if (!fileId) {
      for (const block of inner) {
        const nested = contentBlocks(block?.content);
        fileId =
          nested.find((b) => b?.file_id)?.file_id ||
          nested.find((b) => b?.type === "file")?.file_id;
        if (fileId) break;
      }
    }
  }

  // Pattern 2b — Skills API *_tool_result blocks (bash_code_execution_tool_result, etc.)
  if (!fileId) {
    for (const block of content) {
      if (
        typeof block?.type === "string" &&
        block.type.endsWith("_tool_result")
      ) {
        const ids = extractFileIds(block);
        if (ids.length) {
          fileId = ids[ids.length - 1];
          break;
        }
      }
    }
  }

  // Pattern 3 — inside tool_use output
  if (!fileId) {
    const toolUse = content.find((b) => b.type === "tool_use");
    fileId = toolUse?.input?.file_id || toolUse?.output?.file_id;
  }

  // Pattern 4 — deep search entire response
  if (!fileId) {
    const str = JSON.stringify(data);
    const match = str.match(/"file_id"\s*:\s*"([^"]+)"/);
    if (match) fileId = match[1];
  }

  return fileId ?? null;
}

function parseAnthropicError(status, errorText) {
  try {
    const payload = JSON.parse(errorText);
    const message = payload?.error?.message;
    if (message) {
      return `Anthropic API error (${status}): ${message}`;
    }
  } catch {
    // response body is not JSON
  }

  return `Anthropic API error (${status}): ${errorText || "Unknown error"}`;
}

async function anthropicFetch(url, options = {}) {
  const apiKey = getApiKey();
  const response = await fetch(url, {
    ...options,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(parseAnthropicError(response.status, errorText));
  }

  return response;
}

async function pickOutputFileId(fileIds, skillId) {
  const extension = skillId === "xlsx" ? ".xlsx" : ".docx";

  for (let i = fileIds.length - 1; i >= 0; i -= 1) {
    const fileId = fileIds[i];
    try {
      const metadataResponse = await anthropicFetch(
        `https://api.anthropic.com/v1/files/${fileId}`,
        {
          headers: {
            "anthropic-beta": "files-api-2025-04-14",
          },
        }
      );
      const metadata = await metadataResponse.json();
      if (metadata.filename?.toLowerCase().endsWith(extension)) {
        return { fileId, filename: metadata.filename };
      }
    } catch {
      // try the next candidate
    }
  }

  const fileId = fileIds[fileIds.length - 1];
  return { fileId, filename: null };
}

export async function generateSkillFile(skillId, prompt, context) {
  const userContent = buildUserMessage(prompt, context, skillId);
  const defaultFilename = skillId === "xlsx" ? "generated.xlsx" : "generated.docx";
  const contentType =
    skillId === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  const messageResponse = await anthropicFetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-beta": SKILLS_BETAS.join(","),
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      container: {
        skills: [
          { type: "anthropic", skill_id: skillId, version: "latest" },
        ],
      },
      tools: [{ type: "code_execution_20250825", name: "code_execution" }],
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const messageData = await messageResponse.json();
  console.log("Full API response:", JSON.stringify(messageData, null, 2));
  console.log("Content blocks:", JSON.stringify(messageData.content, null, 2));

  const fileId = extractFileIdFromResponse(messageData);

  if (!fileId) {
    console.error(
      "Could not find file_id in response:",
      JSON.stringify(messageData, null, 2)
    );
    throw new SkillFileExtractionError(
      "No file generated — see response for structure",
      messageData
    );
  }

  const { fileId: pickedFileId, filename: pickedFilename } = await pickOutputFileId(
    [fileId],
    skillId
  );
  const filename = pickedFilename ?? defaultFilename;

  const fileResponse = await anthropicFetch(
    `https://api.anthropic.com/v1/files/${pickedFileId}/content`,
    {
      headers: {
        "anthropic-beta": "files-api-2025-04-14",
      },
    }
  );

  const buffer = Buffer.from(await fileResponse.arrayBuffer());

  return { buffer, filename, contentType };
}
