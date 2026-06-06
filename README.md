# Iron City Cargo — Agent Group Chat

Multi-agent chat for Iron City Cargo with Reid (CFO), Leo (COO), and Mason (Business Development).

## Local development

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` in the project root:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

`ANTHROPIC_API_KEY` is used by the backend file-generation server (Excel/Word). It can be the same value as `VITE_ANTHROPIC_API_KEY`.

If your database was created before file uploads were added, run this in the Supabase SQL Editor:

```sql
alter table public.messages add column if not exists attachments jsonb;
```

3. Run the Supabase setup script (`supabase-setup.sql`) in your Supabase SQL Editor if you have not already.

4. Start local development (frontend + file-generation API):

```bash
npm run dev
```

- Vite frontend: http://localhost:5173
- Express file API: http://localhost:3001 (proxied via Vite at `/api/*`)

Or run them separately:

```bash
npm run dev:frontend   # Vite only (Excel/Word buttons will not work)
npm run server         # file API only
```

## Deploy to Vercel

1. Connect the repository to Vercel.
2. Add these environment variables in the Vercel project settings:

| Variable | Description |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_ANTHROPIC_API_KEY` | Anthropic API key (browser chat) |
| `ANTHROPIC_API_KEY` | Anthropic API key (serverless Excel/Word generation) |

3. In the Supabase SQL editor, run (after `supabase-setup.sql`):
   - **`supabase-documents.sql`** — `agent_documents` table + `agent-documents` storage bucket
   - **`supabase-memory-cloud.sql`** — adds `scope_id` to `memory` for per-module cloud sync
   - **`supabase-chats-cloud.sql`** — adds `scope_id` + module fields to `chats`; relaxes `messages.agent` for all agent groups
   - **`supabase-user-preferences.sql`** — optional; **not used** for active UI (module/chat/sidebar stay local per browser)

4. Deploy. The frontend is served from `dist/`, and the file generation endpoints run as Vercel serverless functions:

- `POST /api/generate-excel`
- `POST /api/generate-docx`

## File generation

Agent messages with tables can generate real `.xlsx` and `.docx` files via the Anthropic Skills API. In production, these routes are handled by Vercel serverless functions. Locally, they are served by `server.js` on port 3001 (proxied through Vite when using `npm run dev`).

## Agent documents (cloud)

Uploaded documents are stored in **Supabase** when you are signed in:

- **Table** `agent_documents` — metadata (name, tags, module scope)
- **Storage** bucket `agent-documents` — processed file payloads (JSON per document)

The app still caches copies in the browser (IndexedDB) for speed. On first login after enabling cloud storage, any local-only files are uploaded once automatically.

### Manual legacy migration (dev / admin)

If documents or memory still exist only in this browser (`docs_meta_*` + IndexedDB `icc_documents`, or `memoryFacts_*`), use the **Settings** menu while signed in on **localhost** or on production with `?legacyMigration=1` in the URL:

1. **Migrate documents to Supabase** — scans all `docs_meta_*` keys, reads payloads from IndexedDB, upserts to `agent_documents` + `agent-documents` bucket. Skips duplicates by `docId` or `scopeId + name + createdAt`. Does not delete local data.
2. **Migrate memory to Supabase** — scans `memoryFacts_*`, upserts into `memory`. Skips duplicates by `scopeId + fact` text.

Check the browser console for a full report (`attempted`, `migrated`, `skipped`, `failed`). After migration, refresh production while signed in as the same user — agents load documents via the existing cloud `listDocuments` → `docContext.textBlocks` path.

## Agent memory (cloud)

Shared knowledge-base facts sync to Supabase when signed in:

- **Table** `memory` — one row per fact, keyed by `user_id` + `scope_id` (module id, e.g. `iron-city-cargo`, `stocks`, `paris`)
- Local `memoryFacts_*` keys remain as a cache; cloud is the source of truth when online

On first login, facts still in localStorage are uploaded once (`migration_memory_cloud_<userId>_done`).

Run **`supabase-memory-cloud.sql`** before using cloud memory (adds the `scope_id` column).

## Chat history (cloud)

Chats and messages sync to Supabase when signed in:

- **Table** `chats` — per `scope_id` (module id), with `module_id`, `module_type`, `module_name`
- **Table** `messages` — linked by `chat_id`; supports all agent keys, `attachments`, `flagged_by`

Local `chatHistory_*` keys remain as a cache. On first login, existing local chats upload once (`migration_chats_cloud_<userId>_done`).

Run **`supabase-chats-cloud.sql`** before using cloud chats.

## Active UI vs durable data

**Per browser only** (localStorage / sessionStorage): active module, business, open chat, sidebar — localhost and production do not affect each other.

**Supabase when signed in**: chats, messages, memory, documents. Cron **Sage briefs** use `importMarketBriefPayload()` so they sync to cloud `chats`/`messages`.
