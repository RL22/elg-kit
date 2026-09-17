/**
 * elg-kit Edge Redirect Worker
 *
 * Cloudflare Worker providing sub-5ms edge redirects for Employee-Led Growth:
 * - Route pattern: /e/:member?url=<destination_url>
 * - Strict destination domain allowlist (prevents open redirects)
 * - Bot/crawler filtering (bypasses analytics logging for preview unfurlers)
 * - Automatic UTM attribution & unique click ID generation (elg_cid)
 * - Asynchronous telemetry emission via Cloudflare Analytics Engine
 */

export interface Env {
  /** Cloudflare Analytics Engine dataset binding */
  ANALYTICS?: AnalyticsEngineDataset;
  /** Comma-separated list of allowed destination domains (e.g. "company.com,docs.company.com") */
  ALLOWED_DOMAINS?: string;
  /** Default fallback destination URL if url param is omitted */
  DEFAULT_DESTINATION?: string;
}

export interface AnalyticsEngineDataset {
  writeDataPoint(event?: {
    indexes?: (string | ArrayBuffer)[];
    blobs?: (string | null | undefined)[];
    doubles?: (number | null | undefined)[];
  }): void;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/**
 * Common bot and preview scraper User-Agent signatures.
 * Matches Slackbot, Twitterbot, LinkedInBot, Googlebot, Bingbot, Facebook unfurlers, etc.
 */
const BOT_UA_REGEX =
  /(slackbot|twitterbot|linkedinbot|googlebot|bingbot|yandex|duckduckbot|baiduspider|facebookexternalhit|whatsapp|telegrambot|discordbot|applebot|crawler|spider|\bbot\b)/i;

/**
 * Detects whether the request originates from an automated crawler or link preview unfurler.
 */
export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return BOT_UA_REGEX.test(userAgent);
}

/**
 * Enforces strict domain allowlist checking against configured domains.
 * Allows exact domain matches and any subdomains (e.g., docs.company.com for company.com).
 * Rejects off-domain targets, malformed URLs, and non-http(s) schemes.
 */
export function isAllowedDomain(targetUrl: URL, allowedDomainsConfig?: string): boolean {
  // Reject non-http(s) schemes (e.g. javascript:, data:, file:)
  if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
    return false;
  }

  const configured = allowedDomainsConfig || "company.com";
  const allowedList = configured
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^\*\./, ""))
    .filter(Boolean);

  if (allowedList.length === 0) {
    return false;
  }

  const hostname = targetUrl.hostname.toLowerCase();

  return allowedList.some((domain) => {
    // Exact hostname match
    if (hostname === domain) return true;
    // Subdomain match (e.g., docs.company.com matches company.com)
    if (hostname.endsWith(`.${domain}`)) return true;
    return false;
  });
}

/**
 * Appends standard ELG tracking parameters and unique click ID to the destination URL.
 */
export function buildAttributedUrl(destination: URL, member: string, clickId: string): URL {
  const url = new URL(destination.toString());
  url.searchParams.set("utm_source", "linkedin");
  url.searchParams.set("utm_medium", "elg");
  url.searchParams.set("utm_campaign", member);
  url.searchParams.set("elg_cid", clickId);
  return url;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;

    // Health check endpoint for uptime probes
    if (pathname === "/health" || pathname === "/healthz") {
      return new Response("OK", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // Match route pattern: /e/:member
    const match = pathname.match(/^\/e\/([^/]+)\/?$/);
    if (!match) {
      return new Response("Not Found", { status: 404 });
    }

    const member = decodeURIComponent(match[1]);
    const destinationParam = requestUrl.searchParams.get("url");

    let targetUrl: URL;

    if (destinationParam) {
      try {
        targetUrl = new URL(destinationParam);
      } catch {
        return new Response("Invalid destination URL format", { status: 400 });
      }
    } else {
      // Fallback to configured default destination or root domain
      const defaultDest = env.DEFAULT_DESTINATION || "https://company.com";
      try {
        targetUrl = new URL(defaultDest);
      } catch {
        return new Response("Invalid default destination configuration", {
          status: 500,
        });
      }
    }

    // Enforce strict destination domain allowlist
    if (!isAllowedDomain(targetUrl, env.ALLOWED_DOMAINS)) {
      return new Response("Unauthorized destination domain", {
        status: 400,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const userAgent = request.headers.get("user-agent") || "";
    const isBot = isBotUserAgent(userAgent);

    // Bot / Crawler Handling:
    // Redirect immediately to target URL without incrementing analytics counters or generating click IDs
    if (isBot) {
      return new Response(null, {
        status: 302,
        headers: {
          Location: targetUrl.toString(),
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Real Visitor Handling:
    // 1. Generate unique click ID
    const clickId = crypto.randomUUID();

    // 2. Append UTM parameters (utm_source=linkedin, utm_medium=elg, utm_campaign=:member, elg_cid=:clickId)
    const attributedUrl = buildAttributedUrl(targetUrl, member, clickId);

    // 3. Asynchronously record click data points using ctx.waitUntil
    if (env.ANALYTICS && typeof env.ANALYTICS.writeDataPoint === "function") {
      const referer = request.headers.get("referer") || undefined;
      const cf = (request as Request & { cf?: { country?: string } }).cf;
      const country = cf?.country || undefined;

      ctx.waitUntil(
        Promise.resolve().then(() => {
          try {
            env.ANALYTICS?.writeDataPoint({
              indexes: [member],
              blobs: [
                member,
                attributedUrl.toString(),
                clickId,
                userAgent || undefined,
                referer,
                country,
              ],
              doubles: [1],
            });
          } catch (err) {
            console.error("Failed to record ELG click data point:", err);
          }
        })
      );
    }

    // 4. Return HTTP 302 Found response with sub-5ms processing
    return new Response(null, {
      status: 302,
      headers: {
        Location: attributedUrl.toString(),
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  },
};
