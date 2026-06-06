# PolyCouncil

Multi-perspective AI council for any domain. Drop in your agents, add your context, deploy in minutes.

PolyCouncil runs a panel of AI perspectives on your questions — each agent has a distinct cognitive lens, they respond in parallel on `@all`, and their answers can be synthesized into a council report. Memory, documents, auth, and cloud sync are built in.

## What you get out of the box

- **Multi-agent chat** — parallel agent firing, `@mention` routing, auto-routing, streaming markdown replies
- **Shared memory** — facts extracted from conversations, synced to Supabase with localStorage cache
- **Document uploads** — IndexedDB + Supabase storage; tagged files injected into agent prompts
- **Auth** — Supabase email/password login and profiles
- **Persistence** — chats and messages in Supabase (scoped per council module)
- **Deploy** — Vite frontend + Express file-export API, ready for Vercel

## Quick start

### 1. Clone and install

```bash
git clone <your-repo-url> polycouncil
cd polycouncil
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_ANTHROPIC_API_KEY` | Anthropic API key (browser — dev only; use a backend proxy in production) |
| `ANTHROPIC_API_KEY` | Anthropic API key for the Express file-generation server |

### 3. Supabase setup

In the Supabase SQL Editor, run these files **in order**:

1. `supabase-setup.sql` — core tables (profiles, chats, messages, memory)
2. `supabase-chats-cloud.sql` — scope columns for multi-module chat history
3. `supabase-memory-cloud.sql` — scope columns for memory
4. `supabase-documents.sql` — document metadata table + storage bucket policies
5. `supabase-user-preferences.sql` — optional UI preferences (if present)
6. `supabase-backfill-profiles.sql` — one-time profile backfill for existing users (if needed)

Create a Supabase Auth user via the dashboard (Authentication → Users → Add user).

### 4. Run locally

```bash
npm run dev
```

Opens the Vite app at `http://localhost:5173` and the file API at `http://localhost:3001`.

Sign in at `/` — you’ll land on the council chat with three example agents: **Strategist**, **Skeptic**, and **Pragmatist**.

## Customize your agents

Edit `src/data/example-agents.js`. Each agent has:

- `slug` — used for `@mentions`, themes, and routing
- `name`, `role`, `description` — UI labels
- `buildContext()` / `shortBuildContext()` — system prompt assembly

Replace `[YOUR CONTEXT HERE]` in each prompt with your domain, business, or expertise. See `CUSTOMIZATION.md` for the full guide.

### Add more agents

1. Copy an agent object in `example-agents.js` and add it to `EXAMPLE_AGENTS`
2. Add the slug to `COUNCIL_THEME_KEYS` in `src/agent-themes.js`
3. Add theme CSS variables in `src/styles.css` and classes in `src/agent-theme-styles.css`
4. Update `buildExampleRoutingPrompt()` and `EXAMPLE_BROADCAST_INSTRUCTIONS`
5. Add `agentTagKeywords` entries in `src/modules/council.js` for document tagging

## Deploy to Vercel

1. Push the repo to GitHub
2. Import the project in Vercel
3. Set the same environment variables as `.env.local`
4. Deploy — `vercel.json` rewrites routes to the SPA and runs the build

Run the Supabase SQL migrations on your production Supabase project before first use.

## Stack

- React 19 + Vite
- Supabase (auth, Postgres, storage)
- Anthropic Claude (Sonnet)
- Express (local file export API)
- Vercel (hosting)

## License

MIT — customize freely for your own use case.
