# `elg-kit`

> Turn shipped work into trusted employee-led distribution.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/create-elg-kit?label=npm&color=cb3837)](https://www.npmjs.com/package/create-elg-kit)
[![Built with Vercel Eve](https://img.shields.io/badge/Built%20with-Vercel%20Eve-black)](https://vercel.com/)

![elg-kit: one ship, five voices](docs/hero-split-signal.gif)

`elg-kit` is the open-source infrastructure and Slack-native workflow for **Employee-Led Growth (ELG)**. It turns verified company milestones into role-specific drafts, routes them through peer review, and gives every employee an attributed link for the first comment.

> [!IMPORTANT]
> Employees stay in control. `elg-kit` never auto-posts to LinkedIn or X — a human reviews, edits, and publishes every post.

## Advocacy vs. Employee-Led Growth

Employee advocacy gives people a content calendar. Employee-Led Growth gives them something real to say. Legacy employee-advocacy platforms distribute approved corporate copy; `elg-kit` starts with real shipped work, then helps builders, marketers, designers, sellers, and recruiters explain why it matters in their own voice.

That is the difference between **Employee Advocacy** and **Employee-Led Growth**: ELG is tied to verified work, shaped by the employee, reviewed by a peer, and measured without turning coworkers into a leaderboard.

## Why `elg-kit`

- **Corporate cringe → role-specific, human drafts.** Generate Builder, GTM, Talent, Visionary, and Product perspectives that follow each employee's voice profile and anti-cringe rules.
- **Attribution void → one-click personal links.** Give each teammate an attributed edge link with automatic UTM parameters and bot-filtered click telemetry.
- **Link reach risk → comment-first distribution.** Keep the post body link-free and place the attributed URL in the first comment. Links in post bodies are widely reported to reduce reach on LinkedIn and X, though the size of the effect is not established, and the comment-first pattern also keeps attribution clean.
- **Security exposure → verification before distribution.** Validate ingestion with HMAC SHA-256 and replay protection, scan drafts for secrets, and restrict redirects to approved domains.
- **Program churn → durable participation without rankings.** Use peer review, private impact recaps, and collective celebrations instead of public leaderboards or stack-ranking.

## `elg-kit` vs. legacy employee advocacy

| | `elg-kit` | Legacy employee-advocacy tools |
| --- | --- | --- |
| Starting point | Verified releases, work signals, and team knowledge | A central content calendar |
| Employee voice | Five role perspectives plus personal voice profiles | Pre-approved corporate copy |
| Publishing | Human-reviewed and manually published | Often optimized for one-click sharing |
| Links | Personal attributed link in the first comment | Links commonly included in the post body |
| Governance | HMAC ingestion, peer review, DLP scanning, and redirect allowlists | Central approval workflows |
| Motivation | Private impact and collective milestones | Leaderboards and individual rankings |
| Deployment | Open source, Apache-2.0 | Quote-based, seat-licensed SaaS |

Unlike Creator-Led Growth, which centers a small group of designated creators, ELG is built for every employee with Slack access. The work stays grounded in what the company actually shipped.

## How it works

1. **Ingest a real signal.** Accept a GitHub release, Linear update, or signed webhook into a review queue.
2. **Choose a useful perspective.** Turn the milestone into Builder, GTM, Talent, Visionary, or Product drafts without losing the technical facts.
3. **Review before publishing.** Ask a cross-functional peer to check accuracy, confidentiality, and security inside Slack.
4. **Publish as a human.** The employee edits and posts the final copy themselves, with no link in the post body.
5. **Attribute the first comment.** Generate a personal shortlink, filter crawler traffic, and measure human clicks without public rankings.

## Built for the whole team

- **Builders and engineers** explain technical decisions and shipped work.
- **Marketers and PMMs** translate milestones into buyer relevance.
- **Designers and product teams** share craft, usability, and product lessons.
- **Sellers and AEs** connect product progress to customer problems.
- **Recruiters and talent teams** show how the team works, not just what it claims.
- **Growth leads and admins** configure sources, governance, and attribution.
- **Peer reviewers** protect technical accuracy and cross-functional trust.

## What ships in the kit

1. **Signal ingestion and curation gate** ([`apps/agent/agent/tools/signal-parser.ts`](apps/agent/agent/tools/signal-parser.ts)). Verifies GitHub, Linear, and custom webhooks with HMAC SHA-256, constant-time signature comparison, and replay protection before signals enter the staging workflow.

2. **Perspective engine** ([`apps/agent`](apps/agent), [`packages/elg-engine`](packages/elg-engine)). Uses the Vercel Eve agent runtime to derive five role perspectives while applying employee voice profiles, link-free body rules, and deterministic anti-cringe filters.

3. **Edge attribution router** ([`packages/edge-redirect`](packages/edge-redirect)). Runs on Cloudflare Workers, enforces destination-domain allowlists, adds UTM attribution, excludes known bots and link unfurlers from analytics, and returns sub-5ms redirects.

4. **Slack showcase and peer-review hub** ([`apps/agent/agent/channels/slack.ts`](apps/agent/agent/channels/slack.ts)). Provides role-angle browsing, pre-publish review modals, one-click personal links, thread-only showcase discussion, private impact reports, and collective team celebrations.

5. **Governance and workflow extensions** ([`extensions`](extensions)). Adds deterministic DLP scanning plus commands for harvesting threads, adapting perspectives, measuring impact, creating retrospectives, and other Slack-native ELG workflows.

## Monorepo layout

<details>
<summary>Full file tree</summary>

```text
elg-kit/
├── apps/
│   └── agent/                         # Vercel Eve Slack hub
│       ├── agent/
│       │   ├── instructions.md        # Voice, safety, and anti-cringe rules
│       │   ├── agent.ts               # Runtime and inference routing
│       │   ├── channels/slack.ts      # Slack commands, events, and review flows
│       │   ├── tools/
│       │   │   ├── signal-parser.ts   # HMAC verification and replay protection
│       │   │   └── voice-profiler.ts  # Durable employee voice profiles
│       │   └── schedules/
│       │       └── weekly-impact.ts   # Private recaps and team milestones
│       └── package.json
├── packages/
│   ├── create-elg-kit/                # Interactive setup CLI
│   ├── edge-redirect/                 # Cloudflare attribution worker
│   └── elg-engine/                    # Perspective and anti-cringe engine
├── extensions/                        # DLP, impact, repost, and workflow modules
├── .env.example                       # Root configuration template
├── slack-manifest.json                # Slack app manifest
├── package.json                       # pnpm and Turborepo root
├── pnpm-workspace.yaml
├── turbo.json
├── LICENSE                            # Apache-2.0
└── NOTICE                             # Copyright and attribution notice
```

</details>

## Quickstart

### Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- A Slack workspace where you can create and install an app

### 1. Run the interactive setup wizard

The fastest path configures your `.env` and generates a customized `slack-manifest.json`:

```bash
npx create-elg-kit
```

Prefer to configure it yourself? Continue with the manual steps below.

### 2. Configure the Slack app

Import `slack-manifest.json` into the [Slack API Dashboard](https://api.slack.com/apps?new_app=1) using the **From an app manifest** option.

### 3. Configure environment variables and inference

Copy the example environment file:

```bash
cp .env.example .env
```

Then choose an inference provider. `elg-kit` supports OpenRouter, Anthropic, OpenAI, Groq, DeepSeek, Ollama, and Vercel AI Gateway.

```bash
# Recommended: OpenRouter universal gateway
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-v1-...
AI_MODEL_ID=anthropic/claude-3.7-sonnet # or google/gemini-2.5-pro, deepseek/deepseek-chat, openai/gpt-5.6-sol

# Or use a provider directly:
# AI_PROVIDER=anthropic  # ANTHROPIC_API_KEY=sk-ant-...  AI_MODEL_ID=claude-3-7-sonnet-latest
# AI_PROVIDER=openai     # OPENAI_API_KEY=sk-proj-...    AI_MODEL_ID=gpt-5.6-sol
# AI_PROVIDER=groq       # GROQ_API_KEY=gsk_...          AI_MODEL_ID=llama-3.3-70b-versatile
# AI_PROVIDER=deepseek   # DEEPSEEK_API_KEY=sk-...       AI_MODEL_ID=deepseek-chat
# AI_PROVIDER=ollama     # OLLAMA_BASE_URL=http://localhost:11434/v1  AI_MODEL_ID=qwen2.5:32b
```

Also supply:

- `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, and `SLACK_APP_TOKEN`
- `EDGE_REDIRECT_BASE_URL`, such as `go.company.com`
- `WEBHOOK_SECRET` for HMAC SHA-256 ingestion verification

> [!IMPORTANT]
> `WEBHOOK_SECRET` is not optional. Without it, `elg-kit` has no way to verify incoming GitHub, Linear, or custom webhooks and will reject signals rather than trust unsigned input.

See [`.env.example`](.env.example) for the full configuration, including the edge-domain allowlist and Vercel KV or Upstash Redis credentials.

### 4. Start development

```bash
pnpm install
pnpm dev
```

## Design principles

- **Human review is mandatory.** The system drafts and routes; employees decide what gets published.
- **The post body stays link-free.** Attributed URLs belong in the first comment.
- **Trust beats volume.** Signed inputs, peer review, DLP checks, and destination allowlists protect the workflow.
- **Participation is not a competition.** Individual impact stays private; public recognition is collective.
- **Inference stays portable.** Choose a hosted provider, a gateway, or local Ollama.

## Contributing

Issues and pull requests are welcome. Keep changes grounded in real employee workflows, preserve the human publishing decision, and include tests for behavior changes.

## License

Copyright © Rodney Lewis and Sprintz. Licensed under [Apache-2.0](LICENSE) with the required attribution in [NOTICE](NOTICE).
