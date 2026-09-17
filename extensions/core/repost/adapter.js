/**
 * @file adapter.js
 * Deterministic Tier 0 Role Adapter and Perspective Translator for ELG Kit.
 * Zero external dependencies.
 */

export const ROLE_DIRECTIVES = {
  gtm: {
    hook: "The technical trade-off that fundamentally changes how our enterprise customers operate:",
    body: "When engineering solves latency and concurrency at the architectural root, system reliability becomes the primary competitive moat. Enterprise buyers care far less about superficial marketing promises than they do about verified uptime SLAs, deterministic query execution, and zero degradation during peak traffic spikes.",
    closing: "By eliminating distributed lock contention at the ingress tier, our customers scale their critical workflows without expensive infrastructure over-provisioning.",
    expansion: [
      "Our go-to-market discussions are grounded in verifiable benchmarks rather than speculative feature checklists.",
      "Customer success teams report zero operational regressions since migrating to deterministic local boundary routing.",
      "Lowering the total cost of ownership allows technical buyers to redeploy compute budgets toward higher-margin initiatives.",
      "Verifiable telemetry traces allow engineering leaders to present transparent operational data directly to executive stakeholders.",
      "This high level of predictability builds authentic enterprise trust that translates directly into accelerated pipeline velocity."
    ]
  },
  talent: {
    hook: "What high-craft engineering actually looks like inside our production systems:",
    body: "We give engineering teams genuine autonomy over system architecture without layer upon layer of managerial bureaucracy. Great engineers do not want to be micromanaged or handed superficial tickets—they want to tackle genuinely hard distributed systems problems, profile real production bottlenecks, and ship clean solutions.",
    closing: "We prioritize inspectability, comprehensive automated regression testing, and predictable failure modes over fragile abstractions.",
    expansion: [
      "Every pull request is reviewed with rigorous adversarial skepticism before hitting our production pipelines.",
      "Engineers here own their systems end-to-end, from the initial architectural RFC to real-time observability telemetry.",
      "Building alongside colleagues who treat operational craft and code hygiene as core virtues makes all the difference.",
      "We celebrate engineers who reduce architectural surface area and eliminate unnecessary dependencies from our codebases.",
      "Our internal design reviews prioritize long-term maintainability and system resilience above all else."
    ]
  },
  product: {
    hook: "Underneath every intuitive user interface is a series of deliberate architectural decisions:",
    body: "True product velocity is not measured by how fast features are shipped—it is measured by unlocking new capabilities while keeping underlying system complexity invisible. When platform infrastructure is robust, frontend experiences feel instantaneous and reliable for everyday users.",
    closing: "Balancing immediate user expectations with long-term infrastructure health is the essence of great product craft.",
    expansion: [
      "We design workflows that minimize cognitive load while ensuring deterministic data validation at every step.",
      "Close collaboration between systems architects and product designers eliminates friction across the entire user journey.",
      "Continuous customer feedback loops guide our engineering priorities toward the highest-leverage reliability improvements.",
      "Our product teams ship with confidence knowing that every user flow is backed by resilient distributed infrastructure.",
      "We measure impact through sustained customer adoption and reduction of operational friction."
    ]
  }
};

/**
 * Deterministically bounds and formats an adapted post body to 150-200 words.
 * @param {string} rawBody
 * @param {string} role - 'gtm' | 'talent' | 'product'
 * @returns {string} Clean 150-200 word post body without links.
 */
export function boundAdaptedBody(rawBody, role = 'gtm') {
  let cleaned = (rawBody || '').replace(/https?:\/\/[^\s)]+/gi, '').replace(/\s{2,}/g, ' ').trim();
  const directive = ROLE_DIRECTIVES[role] || ROLE_DIRECTIVES.gtm;

  let paragraphs = [
    directive.hook,
    `Technical context: ${cleaned}`,
    directive.body,
    directive.closing
  ];

  let fullText = paragraphs.join('\n\n');
  let currentWords = fullText.split(/\s+/).filter(Boolean).length;

  let expIdx = 0;
  while (currentWords < 150 && expIdx < directive.expansion.length) {
    paragraphs.splice(paragraphs.length - 1, 0, directive.expansion[expIdx]);
    fullText = paragraphs.join('\n\n');
    currentWords = fullText.split(/\s+/).filter(Boolean).length;
    expIdx++;
  }

  // Trim if over 200 words
  while (currentWords > 200 && paragraphs.length > 2) {
    paragraphs.splice(1, 1);
    fullText = paragraphs.join('\n\n');
    currentWords = fullText.split(/\s+/).filter(Boolean).length;
  }

  const words = fullText.split(/\s+/).filter(Boolean);
  if (words.length > 200) {
    fullText = words.slice(0, 195).join(' ') + '.';
  }

  return fullText;
}

/**
 * Formats dual-attribution first comment for cross-functional reposts.
 * @param {string} originalAuthor
 * @param {string} edgeUrl
 * @param {string} role
 * @returns {string}
 */
export function formatDualAttribution(originalAuthor, edgeUrl, role = 'gtm') {
  const roleLabel = role === 'talent' ? 'Team craft breakdown' : 'Original engineering architecture';
  return `${roleLabel} by @${originalAuthor}. Verifiable metrics and full documentation: ${edgeUrl}`;
}
