import Anthropic from "@anthropic-ai/sdk";
import { getActiveModule } from "./modules/index.js";
import { buildDocumentContext } from "../documents/contextBuilder.js";
import {
  buildRoutingDescription,
} from "./attachments.js";
import {
  addMemoryFact,
  createChat,
  deleteChat,
  deleteMemoryFact,
  exportChat,
  getChat,
  getChats,
  getAgentMemory,
  migrateOldData,
  migrateDocumentMetadataV2,
  isLegacyMigrationAllowed,
  migrateLegacyDocumentsToSupabase,
  migrateLegacyMemoryToSupabase,
  setCloudStorageUser,
  syncLocalChatsToCloud,
  syncLocalMemoryToCloud,
  getMemory,
  getMessages,
  getMessagesForContext,
  replaceAllMemory,
  saveMessage,
  stripAgentNamePrefix,
  updateChatTitle,
} from "./storage.js";

export {
  addMemoryFact,
  createChat,
  deleteChat,
  deleteMemoryFact,
  exportChat,
  getChat,
  getChats,
  getAgentMemory,
  migrateOldData,
  migrateDocumentMetadataV2,
  isLegacyMigrationAllowed,
  migrateLegacyDocumentsToSupabase,
  migrateLegacyMemoryToSupabase,
  setCloudStorageUser,
  syncLocalChatsToCloud,
  syncLocalMemoryToCloud,
  getMemory,
  getMessages,
  getMessagesForContext,
  replaceAllMemory,
  saveMessage,
  stripAgentNamePrefix,
  updateChatTitle,
};

const MODEL = "claude-sonnet-4-6";

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
  dangerouslyAllowBrowser: true,
});

function getAgentMap() {
  return getActiveModule().agentGroup ?? {};
}

function getAllAgentKeys() {
  return Object.keys(getAgentMap());
}

function extractText(response) {
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function getMessageTextForTokens(messageText) {
  if (typeof messageText === "string") return messageText;
  if (Array.isArray(messageText)) {
    return messageText
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

function messageHasAttachments(messageText, mediaBlocks = []) {
  if (mediaBlocks.length > 0) return true;
  if (messageText?.hasAttachments) return true;
  if (Array.isArray(messageText)) {
    return messageText.some((block) => block.type !== "text");
  }
  return false;
}

function buildUserMessageContent(userMessage, mediaBlocks = []) {
  if (!mediaBlocks.length) return userMessage;

  const blocks = [...mediaBlocks];

  if (typeof userMessage === "string") {
    if (userMessage.trim()) blocks.push({ type: "text", text: userMessage });
  } else if (Array.isArray(userMessage)) {
    blocks.push(...userMessage);
  } else if (userMessage != null) {
    blocks.push({ type: "text", text: String(userMessage) });
  }

  if (blocks.length === 1 && blocks[0].type === "text") return blocks[0].text;
  return blocks;
}

async function buildModuleDocumentContext(
  moduleId,
  agentName,
  userMessage = "",
  conversationHistory = []
) {
  try {
    return await buildDocumentContext(moduleId, agentName, {
      userMessage,
      conversationHistory,
    });
  } catch (err) {
    console.error("Module document context load failed:", err);
    return { textBlocks: "", mediaBlocks: [] };
  }
}

function getMaxTokens(messageText) {
  const messageStr = getMessageTextForTokens(messageText).toLowerCase();

  if (messageStr.includes("@all")) return 1024;

  if (
    messageStr.includes("brief") ||
    messageStr.includes("full") ||
    messageStr.includes("complete") ||
    messageStr.includes("detailed") ||
    messageStr.includes("executive summary")
  )
    return 4096;

  if (messageHasAttachments(messageText)) return 4096;

  return 2048;
}

const RATE_LIMIT_MESSAGE =
  "Hit the API rate limit — too many tokens sent in one minute. Wait 60 seconds and try again. If this keeps happening, the conversation history may be too long — start a new chat and paste just the relevant context.";

const MAX_TOKENS_TRUNCATION_NOTE =
  "\n\n---\n*Response reached the length limit. Ask me to continue with the next section if needed.*";

function isRateLimitError(err) {
  return err?.status === 429 || err?.message?.includes("rate_limit");
}

export function isRateLimitedResponse(result) {
  return Boolean(result && typeof result === "object" && result.rateLimited);
}

async function createAnthropicMessage(params) {
  try {
    return await anthropic.messages.create(params);
  } catch (err) {
    if (isRateLimitError(err)) {
      return { rateLimited: true, message: RATE_LIMIT_MESSAGE };
    }
    throw err;
  }
}

async function createAgentResponseWithContinuation({
  system,
  conversationHistory,
  userMessage,
  maxTokens,
  mediaBlocks = [],
}) {
  const trimmedHistory = conversationHistory.slice(-10);
  const userContent = buildUserMessageContent(userMessage, mediaBlocks);
  const hasAttachments = messageHasAttachments(userMessage, mediaBlocks);
  const messages = [...trimmedHistory, { role: "user", content: userContent }];
  const payload = {
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  };

  const response = await createAnthropicMessage(payload);

  if (isRateLimitedResponse(response)) return response;

  let text = extractText(response);

  if (response.stop_reason === "max_tokens" && text) {
    if (hasAttachments) {
      text += MAX_TOKENS_TRUNCATION_NOTE;
    } else {
      const continueResponse = await createAnthropicMessage({
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: [
          ...messages,
          { role: "assistant", content: text },
          { role: "user", content: "Continue from where you left off." },
        ],
      });

      if (isRateLimitedResponse(continueResponse)) return continueResponse;
      text += extractText(continueResponse);
    }
  }

  return text;
}

function normalizeAgentName(name, agentMap) {
  const map = agentMap ?? getAgentMap();
  const key = name?.trim().toLowerCase();
  if (key in map) return key;
  const match = Object.keys(map).find((k) => k.startsWith(key ?? ""));
  return match ?? Object.keys(map)[0];
}

function parseJsonArray(text) {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed))
      return parsed.filter((item) => typeof item === "string");
  } catch {
    /* fall through */
  }

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed))
        return parsed.filter((item) => typeof item === "string");
    } catch {
      /* fall through */
    }
  }

  return [];
}

export async function detectAgent(messageText, fileHints = []) {
  const mod = getActiveModule();
  const agentKeys = Object.keys(getAgentMap());

  const keyPattern = agentKeys.join("|");
  const mentionMatch = messageText
    .trim()
    .match(new RegExp(`^@(${keyPattern}|all)\\b`, "i"));

  if (mentionMatch) {
    const tag = mentionMatch[1].toLowerCase();
    return tag === "all" ? "all" : tag;
  }

  const routingText = buildRoutingDescription(messageText, fileHints);
  const routingPrompt = mod.buildRoutingPrompt?.() ?? "";

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 10,
    system: routingPrompt,
    messages: [{ role: "user", content: routingText }],
  });

  return normalizeAgentName(extractText(response));
}

export async function getAgentResponse(
  agentName,
  conversationHistory,
  userMessage,
  options = {}
) {
  const {
    userId = null,
    memoryFacts: prefetchedMemory = null,
    broadcastInstruction = null,
  } = options;

  const mod = getActiveModule();
  const agentMap = getAgentMap();
  const agentKey = normalizeAgentName(agentName, agentMap);
  const agent = agentMap[agentKey];

  if (!agent) throw new Error(`Unknown agent: ${agentName}`);

  let memoryFacts = prefetchedMemory;
  if (memoryFacts == null && userId) {
    memoryFacts = await getMemory(userId);
  }
  memoryFacts = memoryFacts ?? [];

  const docContext = await buildModuleDocumentContext(
    mod.id,
    agent.name,
    userMessage,
    conversationHistory
  );

  console.log("[documents] agent prompt", {
    moduleType: mod.moduleType,
    moduleId: mod.id,
    agentName: agent.name,
    metadataKey: `pc-docs_meta_${mod.id}`,
    textBlocksPopulated: Boolean(docContext?.textBlocks?.trim()),
    textBlocksLength: docContext?.textBlocks?.length ?? 0,
  });

  let system = messageHasAttachments(userMessage, docContext.mediaBlocks)
    ? await agent.shortBuildContext(memoryFacts, mod, docContext)
    : await agent.buildContext(memoryFacts, mod, docContext);

  if (broadcastInstruction) {
    system = `${system}\n\n${broadcastInstruction}`;
  }

  return createAgentResponseWithContinuation({
    system,
    conversationHistory,
    userMessage,
    maxTokens: getMaxTokens(userMessage),
    mediaBlocks: docContext.mediaBlocks ?? [],
  });
}

export async function getAllAgentsResponse(
  conversationHistory,
  userMessage,
  memoryInput,
  { onResponse, onAgentStart } = {}
) {
  const results = [];
  const sharedMemory = memoryInput ?? [];
  const mod = getActiveModule();
  const broadcastInstructions = mod.broadcastInstructions ?? {};
  const agentKeys = getAllAgentKeys();
  const agentMap = getAgentMap();

  for (let i = 0; i < agentKeys.length; i++) {
    const agentName = agentKeys[i];

    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    if (onAgentStart) await onAgentStart(agentName);

    const content = await getAgentResponse(
      agentName,
      conversationHistory,
      userMessage,
      {
        memoryFacts: sharedMemory,
        broadcastInstruction: broadcastInstructions[agentName] ?? null,
      }
    );

    const entry = { agent: agentName, content };
    results.push(entry);
    if (onResponse) await onResponse(entry);

    if (i === 3 && agentKeys.length > 4) {
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }

    if (isRateLimitedResponse(content)) {
      const remaining = agentKeys.slice(i + 1);
      if (remaining.length > 0) {
        const skippedNames = remaining
          .map((k) => agentMap[k]?.name ?? k)
          .join(", ");
        const lastEntry = {
          agent: agentName,
          content: `Rate limit hit — ${skippedNames} didn't get a chance to respond. Wait 60 seconds and ask again, or message them individually.`,
        };
        if (onResponse) await onResponse(lastEntry);
      }
      break;
    }
  }

  return results;
}

function buildMemoryExtractionPrompt() {
  const mod = getActiveModule();
  const label = mod?.displayName ?? "this module";
  const agentNames = Object.values(getAgentMap())
    .map((a) => `${a.name} (${a.role})`)
    .join(", ");

  return `Read this conversation and extract key facts about ${label} that the agents (${agentNames}) should remember for future sessions. Include relevant decisions, context, and important details. Do not include temporary point-in-time data that will be stale tomorrow. Return a JSON array of strings, each being one concise fact. If there are no relevant facts return [].`;
}

export async function extractSharedMemoryFromChat(conversationHistory) {
  const historyText = conversationHistory
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: `${buildMemoryExtractionPrompt()}

Respond with ONLY a valid JSON array of strings. No markdown, no code fences, no explanation.`,
    messages: [{ role: "user", content: `Conversation:\n\n${historyText}` }],
  });

  return parseJsonArray(extractText(response));
}
