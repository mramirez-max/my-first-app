<!-- VERCEL BEST PRACTICES START -->
## Best practices for developing on Vercel

These defaults are optimized for AI coding agents (and humans) working on apps that deploy to Vercel.

- Treat Vercel Functions as stateless + ephemeral (no durable RAM/FS, no background daemons), use Blob or marketplace integrations for preserving state
- Edge Functions (standalone) are deprecated; prefer Vercel Functions
- Don't start new projects on Vercel KV/Postgres (both discontinued); use Marketplace Redis/Postgres instead
- Store secrets in Vercel Env Variables; not in git or `NEXT_PUBLIC_*`
- Provision Marketplace native integrations with `vercel integration add` (CI/agent-friendly)
- Sync env + project settings with `vercel env pull` / `vercel pull` when you need local/offline parity
- Use `waitUntil` for post-response work; avoid the deprecated Function `context` parameter
- Set Function regions near your primary data source; avoid cross-region DB/service roundtrips
- Tune Fluid Compute knobs (e.g., `maxDuration`, memory/CPU) for long I/O-heavy calls (LLMs, APIs)
- Use Runtime Cache for fast **regional** caching + tag invalidation (don't treat it as global KV)
- Use Cron Jobs for schedules; cron runs in UTC and triggers your production URL via HTTP GET
- Use Vercel Blob for uploads/media; Use Edge Config for small, globally-read config
- If Enable Deployment Protection is enabled, use a bypass secret to directly access them
- Add OpenTelemetry via `@vercel/otel` on Node; don't expect OTEL support on the Edge runtime
- Enable Web Analytics + Speed Insights early
- Use AI Gateway for model routing, set AI_GATEWAY_API_KEY, using a model string (e.g. 'anthropic/claude-sonnet-4.6'), Gateway is already default in AI SDK
  needed. Always curl https://ai-gateway.vercel.sh/v1/models first; never trust model IDs from memory
- For durable agent loops or untrusted code: use Workflow (pause/resume/state) + Sandbox; use Vercel MCP for secure infra access
<!-- VERCEL BEST PRACTICES END -->

# OKR Operating System — Project Guide

Full-stack OKR + AI Chief of Staff app for Ontop. Deployed on Vercel.

## Tech Stack
- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase (PostgreSQL + Auth + RLS + Storage)
- Anthropic Claude API (`claude-sonnet-4-6` for chat/extraction, `claude-opus-4-6` for bulk OKR import)
- Vercel (hosting)
- Slack API (bot token + signing secret)

## Key Patterns

### Anthropic clients
Always instantiate with `maxRetries: 5` for 529 overload resilience:
```ts
new Anthropic({ maxRetries: 5 })
```

### PDF uploads
PDFs go **browser → Supabase Storage** directly (not through Vercel serverless). Vercel has a 4.5MB hard limit on route handler payloads that cannot be overridden. The extract route receives a URL, not file bytes.

### Quarter gating
```ts
const isFutureQuarter = year > currentYear || (year === currentYear && quarter > currentQuarter)
const isEditable = isCurrentQuarter || isFutureQuarter
```
Both current and future quarters are editable. Only past quarters are read-only.

### AI data hierarchy (always enforce in prompts)
1. **Business Metrics** — ground truth for all KPIs (labeled by month/year)
2. **OKR updates** — qualitative signals: confidence, blockers, weekly progress
3. **Strategic documents** — context/narrative only; do NOT cite their metrics if Business Metrics has more recent data

### Slack bot
- Posts "Thinking…" immediately, processes in `after()` to avoid 3s timeout
- `max_tokens: 2000` — never truncates comprehensive answers
- Splits long answers into ≤2800-char chunks, posted sequentially in same thread

## Database Migrations
- `001_initial.sql` — full schema + RLS + seed data
- `002_business_metrics.sql` — business_metrics table
- `003_company_documents.sql` — company_documents table
- `004_documents_storage.sql` — Supabase Storage bucket `company-documents`

## Key Files
| File | Purpose |
|------|---------|
| `lib/metrics.ts` | METRIC_DEFINITIONS, formatMetricValue, MONTH_NAMES |
| `components/executive/ExecutiveClient.tsx` | AI chat UI + buildSystemContext |
| `components/executive/DocumentsTab.tsx` | PDF upload → extract → review → save flow |
| `app/api/slack/events/route.ts` | Slack bot + buildOKRContext + chunkMessage |
| `app/api/documents/extract/route.ts` | PDF → Claude extraction (maxDuration=60) |
| `app/api/ai-bulk-import/route.ts` | Bulk OKR import from PDF/text (claude-opus-4-6) |
| `components/layout/QuarterSelector.tsx` | Quarter dropdown (2 future + 5 past quarters) |

## Route Handlers with Special Config
```ts
// app/api/documents/extract/route.ts
export const maxDuration = 60  // large PDFs need extra time
```

## Environment Variables (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
SLACK_BOT_TOKEN
SLACK_SIGNING_SECRET
CRON_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_CALENDAR_REFRESH_TOKEN
```

## Roles
- `admin` — full access, can upload documents, edit all areas
- `area_lead` — can edit their own area's OKRs
- `team_member` — read-only

## Quarter Navigation
URL params: `?q=<1-4>&y=<year>`. `getCurrentQuarter()` in `/types` drives defaults everywhere.

## Users
- Julian = CEO
- Cami = COO (also admin)
