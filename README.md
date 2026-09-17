# `elg-kit`

> **Employee-Led Growth (ELG) Rails**: Open-source toolkit and universal agent skill for high-growth tech teams.

Authored by **Rodney Lewis** and **Sprintz**. Licensed under **Apache-2.0** with required attribution (see [NOTICE](NOTICE)).

---

## What is `elg-kit`?

Technical companies want organic distribution on professional networks, but legacy employee advocacy fails due to corporate cringe, attribution voids, algorithm link penalties, and uncurated leaks.

`elg-kit` solves this with four hardened subsystems:
1. **Signal Ingestion & Curation Gate** (`apps/agent/agent/tools/signal-parser.ts`): HMAC SHA-256 verified ingestion from GitHub Releases, Linear, and webhooks with staging queue review.
2. **Perspective Engine** (`apps/agent` / `packages/elg-engine`): Vercel Eve agent deriving 5 authentic role perspectives (Builder, GTM, Talent, Visionary, Product) adhering to employee voice profiles.
3. **Hardened Edge Redirect Router** (`packages/edge-redirect`): Cloudflare Worker delivering <5ms redirects (`go.company.com/e/:member`) with strict domain allowlists and bot crawler filtering.
4. **Slack Showcase & Peer Review Hub** (`apps/agent/agent/channels/slack.ts`): Decentralized Slack workspace with pre-publish peer reviews, 1-click personal link generation for teammates (`[ 🔗 Get My Attributed Link ]`), thread-only discussion enforcement, and collective volume celebrations.

---

## Monorepo Layout

```text
elg-kit/
├── apps/
│   └── agent/                     # Vercel Eve Slack Showcase Hub
│       ├── agent/
│       │   ├── instructions.md    # System directives, anti-cringe constraints, banned vocabulary
│       │   ├── agent.ts           # Runtime configuration & Vercel AI Gateway model routing
│       │   ├── channels/
│       │   │   └── slack.ts       # Slack slash commands, modals, & event router
│       │   ├── tools/
│       │   │   ├── signal-parser.ts   # GitHub/Linear HMAC verification & replay protection
│       │   │   └── voice-profiler.ts  # Durable KV memory for employee writing samples
│       │   └── schedules/
│       │       └── weekly-impact.ts   # Friday 1:1 impact recaps & Cloudflare telemetry
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── edge-redirect/             # Cloudflare Worker edge redirect router
│   └── elg-engine/                # Perspective engine library & skill
├── package.json                   # Monorepo root (pnpm + Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
├── slack-manifest.json            # 1-click Slack app manifest
├── LICENSE                        # Apache 2.0
└── NOTICE                         # Copyright & Authorship Attribution
```

---

## Quickstart

### 1. Configure Slack App
Import `slack-manifest.json` into your [Slack API Dashboard](https://api.slack.com/apps?new_app=1) using the "From an app manifest" option.

### 2. Environment Variables
Copy `.env.example` in `apps/agent` and supply:
- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APP_TOKEN`
- `AI_GATEWAY_URL`, `AI_GATEWAY_TOKEN`
- `EDGE_REDIRECT_BASE_URL` (e.g., `go.company.com`)
- `WEBHOOK_SECRET`

### 3. Development
```bash
pnpm install
pnpm dev
```
