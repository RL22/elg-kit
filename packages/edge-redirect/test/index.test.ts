import { describe, it, expect, vi, beforeEach } from "vitest";
import worker, {
  Env,
  ExecutionContext,
  isAllowedDomain,
  isBotUserAgent,
  buildAttributedUrl,
} from "../src/index";

describe("Edge Redirect Worker", () => {
  let mockEnv: Env;
  let mockCtx: ExecutionContext;
  let writeDataPointMock: ReturnType<typeof vi.fn>;
  let waitUntilMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    writeDataPointMock = vi.fn();
    waitUntilMock = vi.fn((promise: Promise<unknown>) => promise);

    mockEnv = {
      ANALYTICS: {
        writeDataPoint: writeDataPointMock,
      },
      ALLOWED_DOMAINS: "company.com, docs.company.com",
      DEFAULT_DESTINATION: "https://company.com",
    };

    mockCtx = {
      waitUntil: waitUntilMock,
      passThroughOnException: vi.fn(),
    };
  });

  describe("Helper Functions", () => {
    describe("isBotUserAgent", () => {
      it("identifies known crawler and social unfurler user agents", () => {
        expect(
          isBotUserAgent("Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)")
        ).toBe(true);
        expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
        expect(
          isBotUserAgent(
            "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)"
          )
        ).toBe(true);
        expect(
          isBotUserAgent(
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
          )
        ).toBe(true);
        expect(
          isBotUserAgent(
            "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
          )
        ).toBe(true);
        expect(isBotUserAgent("Discordbot/2.0; +https://discordapp.com")).toBe(true);
        expect(isBotUserAgent("TelegramBot (like TwitterBot)")).toBe(true);
      });

      it("returns false for regular human browser user agents", () => {
        expect(
          isBotUserAgent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
          )
        ).toBe(false);
        expect(
          isBotUserAgent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
          )
        ).toBe(false);
        expect(isBotUserAgent(null)).toBe(false);
        expect(isBotUserAgent("")).toBe(false);
      });
    });

    describe("isAllowedDomain", () => {
      it("allows exact matches and valid subdomains", () => {
        expect(
          isAllowedDomain(new URL("https://company.com/pricing"), "company.com")
        ).toBe(true);
        expect(
          isAllowedDomain(new URL("https://docs.company.com/api"), "company.com")
        ).toBe(true);
        expect(
          isAllowedDomain(new URL("https://sub.docs.company.com"), "company.com")
        ).toBe(true);
      });

      it("rejects open redirect attack vectors", () => {
        // Attacker prefix
        expect(
          isAllowedDomain(new URL("https://evilcompany.com"), "company.com")
        ).toBe(false);
        // Attacker suffix
        expect(
          isAllowedDomain(
            new URL("https://company.com.attacker.com"),
            "company.com"
          )
        ).toBe(false);
        // Unrelated domain
        expect(
          isAllowedDomain(new URL("https://phishing.net"), "company.com")
        ).toBe(false);
        // Non-http schemes
        expect(
          isAllowedDomain(new URL("javascript:alert(1)"), "company.com")
        ).toBe(false);
      });

      it("supports multiple configured domains and wildcards", () => {
        const config = "*.company.com, acme.org, brand.co";
        expect(isAllowedDomain(new URL("https://acme.org/features"), config)).toBe(
          true
        );
        expect(isAllowedDomain(new URL("https://app.brand.co"), config)).toBe(true);
        expect(isAllowedDomain(new URL("https://other.com"), config)).toBe(false);
      });
    });

    describe("buildAttributedUrl", () => {
      it("appends standard UTM tags and click ID while preserving existing params", () => {
        const dest = new URL("https://company.com/product?ref=internal");
        const member = "rodney";
        const cid = "test-cid-1234";

        const result = buildAttributedUrl(dest, member, cid);
        expect(result.searchParams.get("ref")).toBe("internal");
        expect(result.searchParams.get("utm_source")).toBe("linkedin");
        expect(result.searchParams.get("utm_medium")).toBe("elg");
        expect(result.searchParams.get("utm_campaign")).toBe("rodney");
        expect(result.searchParams.get("elg_cid")).toBe("test-cid-1234");
      });
    });
  });

  describe("Worker fetch handler", () => {
    const HUMAN_UA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    const BOT_UA = "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient)";

    describe("Allowlist rejection (HTTP 400)", () => {
      it("rejects unauthorized destination domain with HTTP 400", async () => {
        const req = new Request(
          "https://go.company.com/e/rodney?url=https://attacker.com/malicious",
          {
            headers: { "user-agent": HUMAN_UA },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain("Unauthorized destination domain");
        expect(writeDataPointMock).not.toHaveBeenCalled();
      });

      it("rejects clever domain spoofing attempts with HTTP 400", async () => {
        const spoofedReq = new Request(
          "https://go.company.com/e/rodney?url=https://company.com.attacker.com/phish",
          {
            headers: { "user-agent": HUMAN_UA },
          }
        );

        const res = await worker.fetch(spoofedReq, mockEnv, mockCtx);
        expect(res.status).toBe(400);
        expect(writeDataPointMock).not.toHaveBeenCalled();
      });

      it("rejects malformed destination URL with HTTP 400", async () => {
        const req = new Request(
          "https://go.company.com/e/rodney?url=not_a_valid_url",
          {
            headers: { "user-agent": HUMAN_UA },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain("Invalid destination URL format");
        expect(writeDataPointMock).not.toHaveBeenCalled();
      });
    });

    describe("Bot crawler filtering", () => {
      it("redirects bots immediately without incrementing analytics counters", async () => {
        const targetUrl = "https://company.com/blog/announcement";
        const req = new Request(
          `https://go.company.com/e/alex?url=${encodeURIComponent(targetUrl)}`,
          {
            headers: { "user-agent": BOT_UA },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);

        // HTTP 302 redirect
        expect(res.status).toBe(302);
        // Redirects directly to target URL without tracking params
        expect(res.headers.get("Location")).toBe(targetUrl);
        // Analytics must NOT be written for automated bots
        expect(writeDataPointMock).not.toHaveBeenCalled();
        expect(waitUntilMock).not.toHaveBeenCalled();
      });

      it("filters Slackbot preview unfurler without analytics write", async () => {
        const targetUrl = "https://company.com/features";
        const req = new Request(
          `https://go.company.com/e/sarah?url=${encodeURIComponent(targetUrl)}`,
          {
            headers: { "user-agent": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)" },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe(targetUrl);
        expect(writeDataPointMock).not.toHaveBeenCalled();
      });
    });

    describe("UTM parameter appending and member slug parsing", () => {
      it("correctly parses member slug and appends all tracking parameters for real visitors", async () => {
        const targetUrl = "https://company.com/careers";
        const req = new Request(
          `https://go.company.com/e/sarah-connor?url=${encodeURIComponent(targetUrl)}`,
          {
            headers: {
              "user-agent": HUMAN_UA,
              referer: "https://www.linkedin.com/feed/",
            },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);

        expect(res.status).toBe(302);
        const location = res.headers.get("Location");
        expect(location).toBeTruthy();

        const redirectedUrl = new URL(location!);
        expect(redirectedUrl.origin).toBe("https://company.com");
        expect(redirectedUrl.pathname).toBe("/careers");
        expect(redirectedUrl.searchParams.get("utm_source")).toBe("linkedin");
        expect(redirectedUrl.searchParams.get("utm_medium")).toBe("elg");
        expect(redirectedUrl.searchParams.get("utm_campaign")).toBe("sarah-connor");
        expect(redirectedUrl.searchParams.get("elg_cid")).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        );

        // Verify analytics point recorded asynchronously
        expect(waitUntilMock).toHaveBeenCalledTimes(1);
        await Promise.all(waitUntilMock.mock.calls.map((c) => c[0]));

        expect(writeDataPointMock).toHaveBeenCalledWith(
          expect.objectContaining({
            indexes: ["sarah-connor"],
            blobs: expect.arrayContaining([
              "sarah-connor",
              redirectedUrl.toString(),
              redirectedUrl.searchParams.get("elg_cid")!,
              HUMAN_UA,
              "https://www.linkedin.com/feed/",
            ]),
            doubles: [1],
          })
        );
      });

      it("handles URL-encoded member names properly", async () => {
        const targetUrl = "https://company.com/pricing";
        const req = new Request(
          `https://go.company.com/e/rodney%20lewis?url=${encodeURIComponent(targetUrl)}`,
          {
            headers: { "user-agent": HUMAN_UA },
          }
        );

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(302);
        const location = res.headers.get("Location");
        const redirectedUrl = new URL(location!);

        expect(redirectedUrl.searchParams.get("utm_campaign")).toBe("rodney lewis");
      });
    });

    describe("Fallback to root domain when url param is omitted", () => {
      it("redirects to default destination when url param is omitted", async () => {
        const req = new Request("https://go.company.com/e/rodney", {
          headers: { "user-agent": HUMAN_UA },
        });

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(302);

        const location = res.headers.get("Location");
        expect(location).toBeTruthy();
        const redirectedUrl = new URL(location!);

        expect(redirectedUrl.origin).toBe("https://company.com");
        expect(redirectedUrl.pathname).toBe("/");
        expect(redirectedUrl.searchParams.get("utm_source")).toBe("linkedin");
        expect(redirectedUrl.searchParams.get("utm_medium")).toBe("elg");
        expect(redirectedUrl.searchParams.get("utm_campaign")).toBe("rodney");
        expect(redirectedUrl.searchParams.get("elg_cid")).toBeDefined();

        expect(waitUntilMock).toHaveBeenCalledTimes(1);
        await Promise.all(waitUntilMock.mock.calls.map((c) => c[0]));
        expect(writeDataPointMock).toHaveBeenCalled();
      });

      it("redirects bots to default root destination without analytics write when url param is omitted", async () => {
        const req = new Request("https://go.company.com/e/rodney", {
          headers: { "user-agent": BOT_UA },
        });

        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(302);
        expect(res.headers.get("Location")).toBe("https://company.com/");
        expect(writeDataPointMock).not.toHaveBeenCalled();
      });
    });

    describe("Route error handling and health check", () => {
      it("returns 200 OK on /health", async () => {
        const req = new Request("https://go.company.com/health");
        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("OK");
      });

      it("returns 404 Not Found on invalid paths", async () => {
        const req = new Request("https://go.company.com/invalid/path");
        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(404);
      });

      it("returns 404 Not Found on /e/ without member slug", async () => {
        const req = new Request("https://go.company.com/e/");
        const res = await worker.fetch(req, mockEnv, mockCtx);
        expect(res.status).toBe(404);
      });
    });
  });
});
