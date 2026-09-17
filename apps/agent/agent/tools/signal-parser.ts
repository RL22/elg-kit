import crypto from 'node:crypto';

export interface MilestoneSignal {
  id: string;
  source: 'github' | 'linear' | 'webhook';
  title: string;
  changelog: string;
  author: {
    name: string;
    email?: string;
    handle?: string;
  };
  repository?: string;
  url: string;
  timestamp: string;
  isEditorialApproved: boolean;
  requiresReview: boolean;
  tags: string[];
}

export interface VerificationResult {
  isValid: boolean;
  reason?: string;
}

// In-memory cache for replay protection (store seen delivery nonces with expiry)
const processedNonceCache = new Map<string, number>();
const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes (300 seconds)

function cleanupExpiredNonces(): void {
  const now = Date.now();
  for (const [nonce, timestamp] of processedNonceCache.entries()) {
    if (now - timestamp > REPLAY_WINDOW_MS) {
      processedNonceCache.delete(nonce);
    }
  }
}

/**
 * Validates HMAC SHA-256 signature with constant-time equality check.
 */
export function verifyHmacSha256(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
  prefix = 'sha256='
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  // Strip prefix if present (e.g. 'sha256=...')
  const cleanSignature = signatureHeader.startsWith(prefix)
    ? signatureHeader.slice(prefix.length)
    : signatureHeader;

  try {
    const computedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody as any)
      .digest('hex');

    const expectedBuffer = Buffer.from(computedHmac, 'hex');
    const actualBuffer = Buffer.from(cleanSignature, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer as any, actualBuffer as any);
  } catch (err) {
    console.error('[signal-parser] Signature verification exception:', err);
    return false;
  }
}

/**
 * Replay protection: verifies request timestamp is within tolerance window
 * and ensures message nonces/delivery IDs are not replayed.
 */
export function verifyReplayProtection(
  deliveryId: string | null | undefined,
  timestampHeader: string | number | null | undefined
): VerificationResult {
  cleanupExpiredNonces();

  const now = Date.now();

  // If a timestamp is provided, verify clock drift
  if (timestampHeader) {
    const parsedTime = typeof timestampHeader === 'number'
      ? timestampHeader
      : isNaN(Number(timestampHeader))
      ? new Date(timestampHeader).getTime()
      : Number(timestampHeader) * (Number(timestampHeader) < 1e11 ? 1000 : 1);

    if (isNaN(parsedTime)) {
      return { isValid: false, reason: 'Malformed timestamp header' };
    }

    if (Math.abs(now - parsedTime) > REPLAY_WINDOW_MS) {
      return {
        isValid: false,
        reason: `Timestamp drift exceeds 5-minute replay window (drift: ${Math.abs(now - parsedTime)}ms)`,
      };
    }
  }

  // If a delivery ID / nonce is provided, check idempotency
  if (deliveryId) {
    if (processedNonceCache.has(deliveryId)) {
      return {
        isValid: false,
        reason: `Replay detected: delivery ID '${deliveryId}' has already been processed`,
      };
    }
    processedNonceCache.set(deliveryId, now);
  }

  return { isValid: true };
}

/**
 * Parses and normalizes incoming release webhooks from GitHub, Linear, or custom sources.
 */
export class SignalParser {
  /**
   * Complete gatekeeper: validates HMAC signature, replay protection, and extracts normalized signal.
   */
  static verifyAndParse(options: {
    rawBody: string | Buffer;
    headers: Record<string, string | string[] | undefined>;
    secret: string;
  }): { signal: MilestoneSignal | null; verification: VerificationResult } {
    const { rawBody, headers, secret } = options;

    // 1. Identify source and signature header
    const githubSig = (headers['x-hub-signature-256'] || headers['x-hub-signature']) as string | undefined;
    const linearSig = headers['linear-signature'] as string | undefined;
    const elgSig = headers['x-elg-signature'] as string | undefined;

    const signature = githubSig || linearSig || elgSig;
    if (!signature) {
      return {
        signal: null,
        verification: { isValid: false, reason: 'Missing HMAC signature header' },
      };
    }

    // 2. Validate HMAC
    const isGithub = !!githubSig;
    const isLinear = !!linearSig;
    const isCustom = !!elgSig;

    const prefix = isGithub ? 'sha256=' : '';
    const hmacValid = verifyHmacSha256(rawBody, signature, secret, prefix);
    if (!hmacValid) {
      return {
        signal: null,
        verification: { isValid: false, reason: 'Invalid HMAC SHA-256 signature' },
      };
    }

    // 3. Replay Protection check
    const deliveryId = (
      headers['x-github-delivery'] ||
      headers['linear-delivery'] ||
      headers['x-elg-delivery-id'] ||
      headers['x-request-id'] ||
      signature
    ) as string | undefined;

    const timestamp = (
      headers['x-elg-timestamp'] ||
      headers['linear-timestamp'] ||
      headers['date']
    ) as string | undefined;

    const replayCheck = verifyReplayProtection(deliveryId, timestamp);
    if (!replayCheck.isValid) {
      return { signal: null, verification: replayCheck };
    }

    // 4. Parse Payload
    try {
      const payloadString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      const json = JSON.parse(payloadString);

      let signal: MilestoneSignal;
      if (isGithub) {
        signal = this.parseGitHubRelease(json);
      } else if (isLinear) {
        signal = this.parseLinearEvent(json);
      } else {
        signal = this.parseGenericWebhook(json);
      }

      return { signal, verification: { isValid: true } };
    } catch (err) {
      return {
        signal: null,
        verification: { isValid: false, reason: `Failed to parse payload: ${(err as Error).message}` },
      };
    }
  }

  /**
   * Normalizes GitHub Release payloads (e.g. action: "published").
   */
  static parseGitHubRelease(payload: any): MilestoneSignal {
    const release = payload.release || payload;
    const repository = payload.repository?.full_name || payload.repository?.name || 'internal/repo';
    const author = release.author || payload.sender || {};

    const tags: string[] = ['release', 'engineering'];
    if (release.prerelease) tags.push('prerelease');
    if (release.tag_name) tags.push(release.tag_name);

    return {
      id: `gh_${release.id || release.tag_name || Date.now()}`,
      source: 'github',
      title: release.name || release.tag_name || 'New Release',
      changelog: release.body || 'No release notes provided.',
      author: {
        name: author.login || 'GitHub Contributor',
        handle: author.login,
      },
      repository,
      url: release.html_url || payload.repository?.html_url || '',
      timestamp: release.published_at || new Date().toISOString(),
      isEditorialApproved: false, // Default: requires editorial staging queue approval
      requiresReview: true,
      tags,
    };
  }

  /**
   * Normalizes Linear issue/cycle/project updates.
   */
  static parseLinearEvent(payload: any): MilestoneSignal {
    const data = payload.data || payload;
    const isProject = payload.type === 'Project' || !!data.lead;

    return {
      id: `lin_${data.id || Date.now()}`,
      source: 'linear',
      title: data.title || data.name || 'Linear Milestone Shipped',
      changelog: data.description || data.body || 'Linear issue resolved.',
      author: {
        name: data.assignee?.name || data.lead?.name || 'Linear Contributor',
        email: data.assignee?.email || data.lead?.email,
      },
      repository: data.project?.name || undefined,
      url: data.url || 'https://linear.app',
      timestamp: data.completedAt || data.updatedAt || new Date().toISOString(),
      isEditorialApproved: false,
      requiresReview: true,
      tags: ['linear', isProject ? 'project' : 'issue'],
    };
  }

  /**
   * Normalizes generic webhooks to /api/signals.
   */
  static parseGenericWebhook(payload: any): MilestoneSignal {
    return {
      id: payload.id || `sig_${Date.now()}`,
      source: 'webhook',
      title: payload.title || 'Product Milestone',
      changelog: payload.changelog || payload.description || '',
      author: {
        name: payload.author?.name || 'Team Member',
        email: payload.author?.email,
        handle: payload.author?.handle,
      },
      repository: payload.repository,
      url: payload.url || '',
      timestamp: payload.timestamp || new Date().toISOString(),
      isEditorialApproved: Boolean(payload.isEditorialApproved),
      requiresReview: !payload.isEditorialApproved,
      tags: payload.tags || ['announcement'],
    };
  }
}
