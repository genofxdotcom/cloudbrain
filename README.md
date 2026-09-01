![CloudBrain](cloudbrain.png)

# CloudBrain V3

**An AI operating environment on Cloudflare.** Chat with an agent that plans, executes tools,
acts through your connected apps (Composio), and makes every step visible — plans, tool calls,
approvals, and results — running entirely on Workers, D1, Durable Objects, and R2.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/truehannan/cloudbrain)

> **V3** runs as a single root-level Worker: the frontend is served from the same deployment
> via the Assets binding, and automations use dynamic schedules driven by one static cron
> trigger. Authentication is handled by whatever you put in front of the deployment (e.g.
> Cloudflare Access) — CloudBrain itself manages no credentials.

## What it does

- **Chat that acts** — Quick mode answers directly; Agent and Deep modes plan, execute tools
  (web search, page fetch, Composio actions), and report what they did.
- **Visible execution** — every plan, tool call, and integration action streams to the UI in
  real time over a per-user WebSocket (Durable Objects). Nothing happens invisibly.
- **Human control** — destructive, sensitive, and externally-visible actions pause for
  approval with *Allow once / Always allow / Deny*; decisions are persisted and revocable.
- **Integrations via Composio (BYOK)** — connect Gmail, Slack, GitHub, Notion, and hundreds
  more. OAuth, API-key, and no-auth flows are driven by Composio's per-toolkit metadata, not
  hardcoded buttons. Credentials live in Composio; CloudBrain stores only identifiers.
- **Dynamic schedules** — create cron-scheduled agent runs in the UI. One static
  `* * * * *` Worker trigger fans out to your schedules in D1; missed-minute guards and run
  history included.
- **Provider-flexible models** — Workers AI works out of the box with zero config; OpenAI,
  Anthropic, Gemini, Groq, and OpenRouter activate when their secrets are set.

## Architecture

```
src/                  Cloudflare Worker (root-level — this is what deploys)
  index.ts            fetch + scheduled handlers
  router.ts           zero-dependency API router
  agent.ts            orchestrator: plan → tools → approvals → respond
  scheduler.ts        dynamic cron fan-out (static trigger → D1 schedules)
  cron.ts             cron parsing / matching / next-run math
  auth.ts             identity mapping (reads proxy email header, provisions users)
  models.ts           provider-flexible model gateway
  tools.ts            tool registry + built-in tools
  realtime.ts         RealtimeHub Durable Object (WS hibernation)
web/                  React SPA (built to web/dist, served by the Worker)
packages/
  shared/             types + zod schemas + redaction
  integrations/       server-only Composio adapter (integration gateway)
schema.sql            D1 schema
wrangler.jsonc        Worker config — assets, bindings, cron trigger
```

| Cloudflare service | Used for |
|---|---|
| **Workers** | API + agent runtime + static asset serving |
| **D1** | users, conversations, messages, approvals, schedules, activity |
| **Durable Objects** | `RealtimeHub` — one per user, WebSocket hibernation |
| **R2** | artifacts bucket |
| **Workers AI** | default model, zero-config |
| **Cron Triggers** | one `* * * * *` trigger driving dynamic schedules |

## Deploy to Cloudflare

Click the button above, or run:

```bash
npm install
npm run deploy        # builds web/ then deploys the Worker
```

After the first deploy:

1. **D1 database** — if you deployed via CLI (the button flow provisions bindings
   interactively):
   ```bash
   npx wrangler d1 create cloudbrain
   # → put the database_id into wrangler.jsonc
   npm run db:remote            # applies schema.sql
   ```
2. **R2 bucket**:
   ```bash
   npx wrangler r2 bucket create cloudbrain-artifacts
   ```
3. **Secrets** (see below) — at minimum `COMPOSIO_API_KEY` if you want integrations.
4. **Protect the deployment** (optional but recommended) — put Cloudflare Access or any
   auth proxy in front of the domain. See next section.

## Identity (external)

CloudBrain has **no login screen and manages no credentials**. Authentication is entirely
external — e.g. a Cloudflare Access self-hosted application over the domain, or any proxy
you run. The Worker simply reads the identity email the proxy already established from
these headers (first match wins):

- `cf-access-authenticated-user-email` (set by Cloudflare Access)
- `x-forwarded-email`
- `x-email`

It maps that email to a user row (auto-provisioned on first visit) so conversations,
memory, integrations, and schedules stay scoped per person.

**No proxy? No problem.** Without identity headers (e.g. plain `wrangler dev`), everything
maps to a single shared local user, so the app is fully usable out of the box. Lock down
who can reach the deployment at the edge — that's the right layer for it anyway.

## Environment

**No env file is required to boot** — everything runs on bindings, and the default model
(Workers AI) needs no key. Everything else is optional BYOK:

| Secret | Required | Purpose |
|---|---|---|
| `COMPOSIO_API_KEY` | for integrations | Composio key from [dashboard.composio.dev](https://dashboard.composio.dev) |
| `OPENAI_API_KEY` | optional | Adds OpenAI models to the picker |
| `ANTHROPIC_API_KEY` | optional | Adds Anthropic models |
| `GEMINI_API_KEY` | optional | Adds Gemini models |
| `GROQ_API_KEY` | optional | Adds Groq models |
| `OPENROUTER_API_KEY` | optional | Adds OpenRouter models |

Set with `npx wrangler secret put <NAME>` or in the dashboard. For local dev, copy
`.dev.vars.example` → `.dev.vars`. Secrets are never exposed to the browser, never logged,
and never stored in D1 — only boolean "configured" flags cross the API.

For the Composio OAuth callback, add `<your-worker-url>/integrations/callback` as the
allowed callback in your Composio auth configs.

## Local development

```bash
npm install
npm run db:local          # apply schema.sql to local D1
npm run dev               # builds web/ then wrangler dev → http://localhost:8787
npm run dev:web           # optional: vite hot-reload on :5173 (proxies /api + /ws)
```

Local dev also needs a `.dev.vars` (see `.dev.vars.example`).

## Security model

- Authentication happens at the edge/proxy; the Worker trusts the identity header and
  scopes all data per resolved user.
- Provider keys never enter model context, logs, or API responses.
- `packages/shared` redaction scrubs tool-call and activity records before persistence.
- Composio actions execute only server-side through `packages/integrations`; connected
  accounts are scoped per CloudBrain user and ownership is verified before every
  execute/disconnect.
- Approval gates live in the orchestrator — the model cannot bypass them.

## License

MIT — see [LICENSE](LICENSE).
