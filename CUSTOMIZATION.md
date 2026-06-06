# Customizing PolyCouncil

This guide is for builders extending the template for a specific domain.

## Defining your agents

Each agent in `src/data/example-agents.js` follows the same anatomy:

1. **Comment block** — reminds you to replace placeholders
2. **YOUR LENS** — one sentence that defines the perspective
3. **DOMAIN CONTEXT** — `[YOUR CONTEXT HERE]` or structured facts about your world
4. **HOW YOU RESPOND** — output rules (length, tone, structure)

### What makes a good perspective

- **Orthogonal lenses** — agents should disagree productively, not repeat each other
- **One job each** — Strategist maps structure; Skeptic stress-tests; Pragmatist ships
- **Concrete prompts** — “Map dependencies” beats “think strategically”
- **Shared memory** — all agents read the same `memoryFacts`; don’t duplicate memory in every prompt

### Productive disagreement

Design agents so their default answers would conflict on ambiguous questions. That tension is the value of a council — the synthesis step (or the human reader) weighs tradeoffs.

## Adding domain context

Replace `[YOUR CONTEXT HERE]` with:

- Who the user is and what they’re optimizing for
- Constraints (budget, timeline, team size, regulations)
- Vocabulary the agents should use
- Facts that rarely change (not live metrics — those belong in chat or memory)

Keep context **short and durable**. Put session-specific facts in memory via “Extract from current chat” or manual entry.

## Changing the synthesis prompt

When a user sends `@all`, each agent gets a **broadcast instruction** from `EXAMPLE_BROADCAST_INSTRUCTIONS` in `example-agents.js` — they answer only from their lens in 2–3 sentences.

For a formal “council report” after all agents respond, add your own synthesis step in `src/app.js` (`getAllAgentsResponse`) or in the UI after all responses arrive: send the collected answers to Claude with a system prompt like:

> Synthesize these perspectives into one brief: areas of agreement, key tensions, and a recommended next step. Do not invent new facts.

## Theming

Agent colors live in CSS variables in `src/styles.css` (`--agent-strategist`, etc.) and utility classes in `src/agent-theme-styles.css` (`.av-strategist`, `.bubble-strategist`, `.th-strategist`).

To rebrand the app:

- Update `:root` purple palette in `styles.css` for sidebar, buttons, and user bubbles
- Swap agent accent variables per slug
- Change `public/index.html` and sidebar “PolyCouncil” label in `public/chat.html`

## Adding a new module

The template ships with one module (`council`). To add another view (e.g. a separate research council):

1. Create `src/modules/your-module.js` with `agentGroup`, `buildRoutingPrompt`, `broadcastInstructions`
2. Register it in `src/modules/index.js` → `ALL_MODULES`
3. Add a theme slug set if agents differ from the default council themes
4. Chats, memory, and documents are scoped by module `id` — each module gets its own `pc-chatHistory_{id}` keys

For most use cases, customizing agents inside the single Council module is enough.

## Document tags

Tags on uploaded files control which agents see which documents. Map tags to agents in `src/modules/council.js` → `agentTagKeywords`. Use tag `all` on a document to share it with every agent.

## localStorage keys

All keys use the `pc-` prefix (see `src/storage-keys.js`). On first load, a migration copies legacy unprefixed keys if present.

## SQL scope

Cloud memory and chats use `scope_id = 'council'` by default. If you add modules, each module id becomes the scope id for that module’s data.
