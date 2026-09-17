# `@elg-kit/edge-redirect`

> Hardened Cloudflare Edge Redirect Worker for `elg-kit` (Employee-Led Growth).

Provides sub-5ms edge redirects for employee-shared links (`go.company.com/e/:member?url=<destination_url>`) with strict domain allowlists, bot crawler filtering, automatic UTM attribution, and asynchronous telemetry logging to Cloudflare Analytics Engine.

---

## Features

- **Route Handling:** Handles `/e/:member?url=<destination_url>` with fallback to default root domain when `url` is omitted.
- **Strict Destination Allowlist:** Rejects open redirect attacks, port attacks, or off-domain links with HTTP 400 Bad Request. Supports exact domains and subdomains (e.g. `docs.company.com`).
- **Bot & Unfurler Filtering:** Fast User-Agent detection for Slackbot, Twitterbot, LinkedInBot, Googlebot, Bingbot, Discordbot, Facebook external hit, etc. Redirects immediately without inflating click counters or generating click IDs.
- **Automatic UTM Tracking:** For human visitors, automatically appends:
  - `utm_source=linkedin`
  - `utm_medium=elg`
  - `utm_campaign=:member`
  - `elg_cid=<uuid-v4>` (unique click identifier)
- **Zero-Latency Telemetry:** Emits click data points asynchronously via `ctx.waitUntil(env.ANALYTICS.writeDataPoint(...))` to Cloudflare Analytics Engine without delaying the HTTP 302 response.
- **Sub-5ms Processing:** Lightweight memory-only processing returning HTTP 302 Found with `Cache-Control: no-cache, no-store, must-revalidate`.

---

## Configuration

Configured via `wrangler.toml` or Cloudflare dashboard variables:

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `ALLOWED_DOMAINS` | `string` | `"company.com"` | Comma-separated list of allowed destination domains. Subdomains are automatically permitted. |
| `DEFAULT_DESTINATION` | `string` | `"https://company.com"` | Fallback destination URL when `?url=` parameter is omitted. |
| `ANALYTICS` | `dataset` | `ELG_CLICKS` | Cloudflare Analytics Engine dataset binding for click tracking. |

---

## Scripts

- `npm test`: Runs Vitest test suite.
- `npm run typecheck`: Runs TypeScript compiler check (`tsc --noEmit`).
- `npm run deploy`: Deploys worker via Wrangler.
