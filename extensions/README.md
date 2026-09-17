---
name: elg-kit-extensions
description: Master agent specification for ELG Kit Core 5 features, Extension Pack, and Admin Meta-Skills. Ingests existing host configuration and orchestrates deterministic Tier 0 scrubbing, schema validation, and Slack Bolt handler execution.
metadata:
  framework: elg-kit
  author: Sprintz
  date_added: "2026-09-17"
---

# ELG Kit: Extension Pack & Core Feature Specification

> **Audience:** Autonomous AI Agents and System Integrators.
> **Standard:** Written in accordance with [`writing-for-agents`](~/.agents/skills/mps-writing-for-agents/SKILL.md).
> **Guiding Principle:** Deterministic Tier 0 execution precedes LLM synthesis. Zero unverified outputs.

---

## 1. Context Ingestion Protocol

Before executing or extending any feature, perform this exact sequential intake. Cache the resolved configuration values in your working memory:

1. **Host Environment Intake (`.env` / `.env.example`):**
   - Ingest `EDGE_BASE_URL` (default: `https://go.company.com`).
   - Ingest `ALLOWED_DESTINATION_DOMAINS` (comma-separated allowlist).
   - Ingest `SLACK_SHOWCASE_CHANNEL_ID` and `SLACK_SHIPPED_CHANNEL_ID`.
   - Ingest active inference API keys (`OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`).

2. **Slack Application Manifest Intake (`slack-manifest.json`):**
   - Ingest registered slash commands (`features.slash_commands`).
   - Ingest registered event subscriptions (`oauth_config.scopes.bot` including `reactions:read`, `channels:history`, `chat:write`).

3. **Inference Engine Intake (`packages/elg-engine/src/router.ts`):**
   - Resolve semantic tiers:
     - `triage` (Tier 1): Intent classification, signal scoring, schema extraction.
     - `workhorse` (Tier 2): Perspective drafting, role adaptation, narrative synthesis.
     - `reasoning` (Tier 3): Skeptic audit, adversarial review, DLP edge case analysis.
     - `frontier` (Tier 3+): Cross-repository architecture audits, executive synthesis.
   - Enforce 2-Wire execution with automatic 1-level 429/503 failover and `<think>` sanitization.

4. **Slack Channel Router Intake (`apps/agent/agent/channels/slack.ts`):**
   - Ingest existing helper functions: `parseThreadTimestamp`, `sanitizeInsightText`, `stripAllUrls`, `countWords`, `slugifyMember`.

*Completion Criterion:* All 4 host sources are read; working memory confirms active edge domain, allowlist, and inference credentials.

---

## 2. Universal Deterministic Boundaries (Tier 0 Policy)

Every generated post or artifact across Core 5, Extension Pack, and Admin Meta-Skills must pass these deterministic bounds before presenting to users:

| Boundary Dimension | Deterministic Standard | Automated Verification |
| :--- | :--- | :--- |
| **Post Word Budget** | Exactly **150 to 200 words** in post body | `countWords(body) >= 150 && countWords(body) <= 200` |
| **Link Separation** | **Zero external URLs** in post body | `stripAllUrls(body).extractedUrls.length === 0` |
| **First Comment Rule** | Personal attributed shortlink strictly in **Comment #1** | `${EDGE_BASE_URL}/e/${memberSlug}` in first comment block |
| **Tone Guard** | Authentic engineer voice; zero hype clichés or emojis | `sanitizeInsightText(body)` strips `[🚀🔥🎉💪📈✨]` and buzzwords |
| **DLP Token Scrub** | Zero exposed secrets, API keys, private keys, or hostnames | `scanDlp(body).clean === true` |

---

## 3. Core 5 Features (Enterprise Operations)

### 3.1 `/harvest` — Thread Quote & Reaction Harvester

Harvests high-signal technical insights from Slack thread replies and converts them into authentic, link-free engineering post drafts.

- **Trigger:** Explicit slash command `/harvest [thread_ts_or_url]` OR emoji reaction `💡` (`:bulb:`) / `📌` (`:pushpin:`) added to any comment.
- **In-File Steps:**
  1. *Timestamp Resolution:* Extract numeric Slack timestamp via `parseThreadTimestamp(text, command.thread_ts)`.
  2. *Thread Retrieval:* Fetch replies using `app.client.conversations.replies`.
  3. *Signal Identification:* Find candidate technical message via `identifyHighSignalComment()`.
  4. *Deterministic Formatting:* Run `formatHarvestedDraft()` to bound post body to 150–200 words and format attributed link into comment #1.
  5. *Delivery:* Send interactive Block Kit card with `[ 📢 Share to #showcase ]` button.
- **Contract Schema:** [`extensions/core/harvest/schema.json`](core/harvest/schema.json)
- **Handler Snippet:** [`extensions/core/harvest/handler.snippet.ts`](core/harvest/handler.snippet.ts)
- **Completion Criterion:** Ephemeral message or author DM is delivered; payload contains valid draft with word count in [150, 200] and 0 body links.

---

### 3.2 `/guard` — Pre-Publish DLP Token & Secret Scanner

Deterministic Tier 0 regex engine that detects, scores, and redacts API keys, tokens, credentials, private keys, and internal infrastructure references before posts are shared.

- **Trigger:** Explicit slash command `/guard [text]` OR automatic interceptor before publishing to public channels.
- **In-File Steps:**
  1. *Regex Pattern Sweep:* Execute `scanDlp(text)` across 8 compiled patterns (AWS keys, Slack tokens, GitHub tokens, OpenAI keys, private key blocks, JWTs, RFC 1918 IPs, internal hostnames).
  2. *Risk Scoring:* Compute aggregate risk score [0, 100].
  3. *Redaction:* Replace all matches with deterministic replacement tags (e.g. `[REDACTED_AWS_KEY]`).
  4. *Delivery:* If `riskScore > 0`, return ephemeral vulnerability alert with itemized findings and sanitized preview. If clean, return pass verification.
- **Contract Schema:** [`extensions/core/guard/schema.json`](core/guard/schema.json)
- **Scanner Engine:** [`extensions/core/guard/scanner.js`](core/guard/scanner.js)
- **Handler Snippet:** [`extensions/core/guard/handler.snippet.ts`](core/guard/handler.snippet.ts)
- **Completion Criterion:** Returns `clean: true` with score 0, or `clean: false` with complete findings array and safe redacted preview.

---

### 3.3 `/suggest` — Ambient Slack Conversation Miner & Ghostwriter

Analyzes user's public technical conversations over the preceding 7 days, scores thread signal, and drafts suggested posts for approval (powers Friday 3:00 PM ambient nudge).

- **Trigger:** Explicit command `/suggest` OR scheduled cron (`0 15 * * 5` — Friday 3:00 PM).
- **In-File Steps:**
  1. *History Mining:* Search user's recent messages via `client.search.messages({ query: 'from:<@user>' })`.
  2. *Signal Scoring:* Compute signal score [0, 100] via `scoreMessageSignal()` using tech keyword density, code block markers, resolution signals, and engagement count.
  3. *Candidate Ranking:* Filter and sort candidates with `rankMessages(messages, 45)`.
  4. *Inference Synthesis:* Call Tier 2 `workhorse` model with top candidate text.
  5. *Deterministic Encasement:* Bound draft to 150–200 words, strip links, and append attributed edge shortlink.
- **Contract Schema:** [`extensions/core/suggest/schema.json`](core/suggest/schema.json)
- **Miner Engine:** [`extensions/core/suggest/miner.js`](core/suggest/miner.js)
- **Handler Snippet:** [`extensions/core/suggest/handler.snippet.ts`](core/suggest/handler.snippet.ts)
- **Completion Criterion:** Ephemeral message contains ranked suggested draft with signal score >= 45 and interactive share button.

---

### 3.4 `/impact` — Private Employee ROI & Verified Reads

Provides employees with on-demand, strictly private reporting on human visitors, estimated verified reads, and business pipeline attributed to their shares.

- **Trigger:** Explicit command `/impact [7 | 30 | 90]`.
- **In-File Steps:**
  1. *Timeframe Resolution:* Parse requested timeframe (default: 30 days).
  2. *Telemetry Fetch:* Query edge click events for `command.user_name`.
  3. *Deterministic Calculation:* Run `calculateImpactReport()` to isolate human clicks from bot crawlers, calculate verified reads (`humanClicks * 0.62`), compute read-through rate, and calculate pipeline value (`reads * $25.00`).
  4. *Delivery:* Render private 4-metric Block Kit card with top inbound referrers.
- **Contract Schema:** [`extensions/core/impact/schema.json`](core/impact/schema.json)
- **Calculator Engine:** [`extensions/core/impact/calculator.js`](core/impact/calculator.js)
- **Handler Snippet:** [`extensions/core/impact/handler.snippet.ts`](core/impact/handler.snippet.ts)
- **Completion Criterion:** Returns private ephemeral Block Kit message displaying verified reads, bot-filtered clicks, and pipeline attribution.

---

### 3.5 `/repost` — Cross-Functional Perspective Adapter

Translates a technical post or release into GTM, Talent, or Product perspectives while preserving technical veracity, enforcing the 150–200 word budget, and crediting the original engineer.

- **Trigger:** Explicit command `/repost [quote_or_url] --role [gtm | talent | product]`.
- **In-File Steps:**
  1. *Role Extraction:* Parse `--role` argument (defaults to `gtm`).
  2. *Workhorse Adaptation:* Dispatch to Tier 2 `workhorse` with role prompt directives.
  3. *Deterministic Bounding:* Execute `boundAdaptedBody(text, role)` ensuring 150–200 words and zero body links.
  4. *Dual Attribution:* Execute `formatDualAttribution(originalAuthor, edgeUrl, role)` in comment #1.
  5. *Delivery:* Send ephemeral preview with `[ 📢 Share to #showcase ]` button.
- **Contract Schema:** [`extensions/core/repost/schema.json`](core/repost/schema.json)
- **Adapter Engine:** [`extensions/core/repost/adapter.js`](core/repost/adapter.js)
- **Handler Snippet:** [`extensions/core/repost/handler.snippet.ts`](core/repost/handler.snippet.ts)
- **Completion Criterion:** Output contains role-adapted text bounded to 150–200 words, dual-attribution first comment, and valid interactive button.

---

## 4. Extension Pack Features (Culture & Longitudinal Growth)

### 4.1 `/rebound` — 90/180-Day Production Retrospective

Generates authentic longitudinal retrospectives comparing original launch theses with real production metrics and unexpected edge cases after months in production.

- **Trigger:** Explicit command `/rebound [release-name] --days [90 | 180]`.
- **In-File Steps:**
  1. *Parameters Extraction:* Parse release name and milestone days.
  2. *Retrospective Formulation:* Assemble thesis, production telemetry delta, unexpected edge cases, and architectural takeaway.
  3. *Deterministic Synthesis:* Run `compileRetrospectiveBody()` guaranteeing [150, 200] words.
  4. *Delivery:* Send interactive ephemeral card linking to RFC/post-mortem.
- **Contract Schema:** [`extensions/pack/rebound/schema.json`](pack/rebound/schema.json)
- **Retrospective Engine:** [`extensions/pack/rebound/retrospective.js`](pack/rebound/retrospective.js)
- **Handler Snippet:** [`extensions/pack/rebound/handler.snippet.ts`](pack/rebound/handler.snippet.ts)
- **Completion Criterion:** Produces 150–200 word production retrospective draft with zero body links and verifiable metrics delta.

---

### 4.2 `/kudos` — Peer Technical Craft Spotlight

Transforms internal peer praise (e.g. from `#shoutouts`) into an authentic external engineering spotlight post celebrating technical craft and system reliability.

- **Trigger:** Explicit command `/kudos @colleague [technical context]`.
- **In-File Steps:**
  1. *Nominee Parsing:* Extract user handle via `extractNominee(text)`.
  2. *Craft Narrative:* Compile technical problem solved, root cause discipline, and team impact via `compileKudosBody()`.
  3. *Deterministic Bounding:* Enforce 150–200 words and zero body links.
  4. *Delivery:* Send ephemeral draft giving spotlight credit to nominee and link to team engineering profile.
- **Contract Schema:** [`extensions/pack/kudos/schema.json`](pack/kudos/schema.json)
- **Spotlight Engine:** [`extensions/pack/kudos/spotlight.js`](pack/kudos/spotlight.js)
- **Handler Snippet:** [`extensions/pack/kudos/handler.snippet.ts`](pack/kudos/handler.snippet.ts)
- **Completion Criterion:** Produces 150–200 word craft spotlight celebrating nominee with zero body links and dual attribution.

---

### 4.3 `/ama` — Internal Architecture Q&A to External FAQ

Synthesizes high-quality internal Slack Q&A discussions and office hours threads into authentic "How We Built It" / Engineering FAQ posts.

- **Trigger:** Explicit command `/ama [question or thread_ts]`.
- **In-File Steps:**
  1. *Q&A Extraction:* Parse question and author response.
  2. *Synthesis:* Compile FAQ narrative highlighting trade-offs and benchmark evidence via `compileFaqBody()`.
  3. *Deterministic Bounding:* Enforce [150, 200] word limit and zero body links.
  4. *Delivery:* Send ephemeral draft with attributed link to architectural decision record (ADR).
- **Contract Schema:** [`extensions/pack/ama/schema.json`](pack/ama/schema.json)
- **Synthesizer Engine:** [`extensions/pack/ama/synthesizer.js`](pack/ama/synthesizer.js)
- **Handler Snippet:** [`extensions/pack/ama/handler.snippet.ts`](pack/ama/handler.snippet.ts)
- **Completion Criterion:** Produces 150–200 word FAQ post draft answering the technical question with zero body links.

---

### 4.4 `/brief` — Executive & Board Milestone Digest Memo

Compiles high-density, numbers-grounded engineering milestone memos for leadership, board updates, and investor newsletters without marketing hype.

- **Trigger:** Explicit command `/brief [period, e.g. Q3 2026]`.
- **In-File Steps:**
  1. *Milestone Aggregation:* Collect shipped milestones, performance deltas (p99 latency, cost, uptime).
  2. *Brief Formulation:* Run `compileBriefBody()` generating structured memo with bullet wins and KPI indicators.
  3. *Deterministic Bounding:* Enforce [150, 200] words and zero body links.
  4. *Delivery:* Send ephemeral draft with attributed link to full roadmap.
- **Contract Schema:** [`extensions/pack/brief/schema.json`](pack/brief/schema.json)
- **Briefer Engine:** [`extensions/pack/brief/briefer.js`](pack/brief/briefer.js)
- **Handler Snippet:** [`extensions/pack/brief/handler.snippet.ts`](pack/brief/handler.snippet.ts)
- **Completion Criterion:** Produces 150–200 word executive brief containing verified KPIs and zero body links.

---

## 5. Admin Meta-Skills (High-Value Orchestration Layer)

Admin Meta-Skills are operational capabilities used by growth leaders, security administrators, and executive sponsors to govern, route, and measure employee advocacy.

### 5.1 `elg-cohort` — Advocate Roster Manager & Tag Router

- **Purpose:** Maintains active advocate roster tagged by technical domain (`infra`, `ai`, `security`, `frontend`, `gtm`, `data`) and load-balances weekly sharing quotas.
- **Script:** [`extensions/meta/cohort/roster.js`](meta/cohort/roster.js)
- **Schema:** [`extensions/meta/cohort/schema.json`](meta/cohort/schema.json)
- **Usage Rule:** When routing a harvested post, execute `matchAdvocatesForTopic(roster, topicTags)` to select eligible advocates with lowest quota utilization.
- **Completion Criterion:** Returns ordered array of active advocates matching domain tags who have remaining weekly quota.

---

### 5.2 `elg-governance` — Allowlist Auditor & Policy Monitor

- **Purpose:** Strictly verifies that external URLs routed through the edge redirect worker match configured corporate domain rules and prevents open redirects or domain spoofing.
- **Script:** [`extensions/meta/governance/auditor.js`](meta/governance/auditor.js)
- **Schema:** [`extensions/meta/governance/schema.json`](meta/governance/schema.json)
- **Usage Rule:** Execute `auditDestinationUrl(url, allowlist)` on every link creation.
- **Completion Criterion:** Returns `valid: true` with `matchedRule` for authorized domains, or `valid: false` with explicit `rejectionReason`.

---

### 5.3 `elg-telemetry` — Executive ROI & Attribution Pipeline

- **Purpose:** Database schemas and SQL queries running on Cloudflare D1 / Analytics Engine for multi-touch attribution and verified read reporting.
- **SQL Schema:** [`extensions/meta/telemetry/d1-schema.sql`](meta/telemetry/d1-schema.sql)
- **Schema:** [`extensions/meta/telemetry/schema.json`](meta/telemetry/schema.json)
- **Usage Rule:** Query D1 tables `edge_clicks` and `edge_conversions` to generate board-ready reports on human clicks, read-through rates, and attributed enterprise pipeline.
- **Completion Criterion:** D1 tables and indices are defined; SQL queries compute human vs bot clicks and revenue attribution.

---

## 6. Verification Protocol

Run the unified deterministic test suite to verify 100% compliance across all schemas, scripts, and formatters:

```bash
node --test extensions/scripts/test-extensions.js
```

### Checkable Completion Checklist
- [x] All 11 JSON schema files parse cleanly and conform to JSON Schema Draft-07 / 2020-12.
- [x] Guard DLP scanner detects AWS keys, Slack tokens, JWTs, and internal hosts while passing clean text.
- [x] Suggest miner correctly scores high-signal technical content and penalizes small talk.
- [x] Impact calculator correctly isolates human clicks from bot scrapers and calculates pipeline value.
- [x] Repost, Rebound, Kudos, AMA, and Brief generators strictly guarantee 150–200 words and zero body links.
- [x] Governance auditor approves valid wildcard subdomains and rejects spoofing or open redirects.
- [x] Cohort roster matcher balances advocate capacity utilization.
- [x] All 15 tests pass with 0 failures and 0 errors.
