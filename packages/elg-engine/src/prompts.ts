/**
 * @file prompts.ts
 * Quintuple-perspective prompt generator for ELG (Employee-Led Growth).
 * Generates role-specific prompts for:
 * - builder
 * - gtm
 * - talent
 * - visionary
 * - product
 */

import {
  DEFAULT_REDIRECT_HOST,
} from './formatter.js';
import {
  GitAuthor,
  MilestonePayload,
  NormalizedMilestone,
  PerspectiveRole,
  PromptOptions,
} from './types.js';

/**
 * Normalizes user/webhook milestone payload into a standard object.
 */
export function normalizeMilestone(input: MilestonePayload): NormalizedMilestone {
  const authorObj: GitAuthor =
    typeof input.author === 'string'
      ? { name: input.author, username: input.author.toLowerCase().replace(/\s+/g, '') }
      : input.author;

  const memberSlug =
    input.memberSlug ||
    input.member_slug ||
    input.member ||
    authorObj.username ||
    authorObj.name.toLowerCase().replace(/[^a-z0-9]/g, '');

  const targetUrl = input.targetUrl || input.target_url;
  const redirectHost = input.redirectHost || input.redirect_host || DEFAULT_REDIRECT_HOST;
  const changelogSummary = input.changelogSummary || input.changelog_summary || '';
  const issueReferences = input.issueReferences || input.issue_references || [];
  const openRoles = input.openRoles || input.open_roles || [];
  const styleSample = input.styleSample || input.style_sample;
  const technicalDetails = input.technicalDetails || input.technical_details;
  const businessMetrics = input.businessMetrics || input.business_metrics;
  const productWorkflow = input.productWorkflow || input.product_workflow;
  const visionaryThesis = input.visionaryThesis || input.visionary_thesis;

  return {
    title: input.title,
    changelogSummary,
    author: authorObj,
    issueReferences,
    targetUrl,
    memberSlug,
    redirectHost,
    openRoles,
    styleSample,
    technicalDetails,
    businessMetrics,
    productWorkflow,
    visionaryThesis,
  };
}

/**
 * System prompt setting universal voice, anti-cringe standards, and schema rules.
 */
export function getSystemPrompt(): string {
  return `You are the ELG Perspective Engine (Employee-Led Growth rails).
Your role is to translate engineering milestones, pull requests, PRDs, and changelogs into authentic, high-signal, peer-to-peer social posts across five distinct perspectives:

1. BUILDER: Technical architecture, engineering trade-offs (why A over B), performance numbers (latency, p99, memory, throughput), what almost broke, internal edge-case discoveries. Writes like a senior engineer sharing war stories with peers.
2. GTM: Business pain solved, operational metrics improved (cost, hours saved, risk mitigated), buyer relevance (why VPs of Eng/CTOs/Ops care), before vs. after. Writes like a pragmatic technical solutions engineer or product marketing lead.
3. TALENT: Engineering velocity demonstration, team culture in practice, autonomy, problem-solving craft, and relevant open roles tied directly to the shipped capability. Shows, rather than tells, why top talent should join.
4. VISIONARY: Strategic industry shift, category creation narrative, contrarian thesis on software evolution, where this sector is heading in 3-5 years. Writes like an engineering founder or principal architect challenging conventional wisdom.
5. PRODUCT: User workflow friction eliminated, usability trade-offs, human day-to-day impact, the tangible before-and-after ergonomics for the daily operator. Writes like a lead product designer or staff PM.

CRITICAL ANTI-CRINGE & EDITORIAL POLICY:
- ZERO CORPORATE HYPE: Strictly forbidden to use clichés like "excited to announce", "game-changer", "supercharge", "delve", "revolutionary", "disrupt", "synergy", "paradigm shift", "next level", "cutting-edge", "state-of-the-art", "seamlessly", "unleash", "humbled and honored", "in today's fast-paced world", "buckle up", or "let's dive in".
- ZERO FORBIDDEN EMOJIS: Never use rocket (🚀), fire (🔥), party popper (🎉), or flexing bicep (💪). Keep emoji usage near zero.
- ZERO RHETORICAL HOOKS: Never open a post with rhetorical questions like "Have you ever wondered...?", "What if I told you...?", or "Tired of dealing with...?". Start with a declarative insight, a specific technical fact, or a concrete problem.
- LINK PLACEMENT POLICY: The main post body MUST BE STRICTLY 100% LINK-FREE. Do not include any HTTP/HTTPS URLs, domains, or markdown hyperlinks inside the post body. Links in the post body are widely reported to reduce reach. All links belong exclusively in the first comment.
- CHARACTER & WORD BUDGET: Target 150 to 300 words per perspective. Crisp, dense, scannable with line breaks.`;
}

/**
 * Detailed role guidelines for prompt compilation.
 */
export const ROLE_GUIDELINES: Record<PerspectiveRole, string> = {
  builder: `ROLE: BUILDER PERSPECTIVE
- Target Audience: Software engineers, architects, devops practitioners, and technical founders.
- Core Topics:
  * Technical architecture & system design choices.
  * Trade-offs made: what alternatives were considered and rejected, and why.
  * Concrete performance numbers: p99 latency, queries per second, memory profile, build times.
  * What almost broke: edge cases uncovered in staging/canary, bugs that nearly shipped, subtle race conditions.
- Tone: Grounded, matter-of-fact, candid, intellectually honest. No promotional chest-thumping.`,

  gtm: `ROLE: GTM (GO-TO-MARKET) PERSPECTIVE
- Target Audience: Engineering directors, CTOs, VP of Product, Operations leaders, enterprise buyers.
- Core Topics:
  * Specific business pain eliminated: manual toil, compliance risks, billing leakage, downtime costs.
  * Operational metrics improved: % reduction in incident response time, hours saved per developer per week, dollar savings.
  * Buyer relevance: why this solves an organizational bottleneck rather than just being "cool tech".
- Tone: Commercially urgent, outcome-focused, ROI-driven, devoid of marketing buzzwords.`,

  talent: `ROLE: TALENT & CULTURE PERSPECTIVE
- Target Audience: Senior engineering candidates, architects, tech leads looking for high-velocity teams.
- Core Topics:
  * Team velocity in action: how fast this went from concept to RFC to production.
  * Team culture: how disagreements were resolved, autonomy given to the author, testing rigor.
  * Specific open roles: ties the shipped milestone directly to open positions and the problems new hires will tackle.
- Tone: Authentic pride in craftsmanship, transparent peek into internal team mechanics, inviting without sounding like an HR brochure.`,

  visionary: `ROLE: VISIONARY & INDUSTRY PERSPECTIVE
- Target Audience: Industry analysts, investors, technology strategists, visionary builders.
- Core Topics:
  * Strategic industry shift: where modern software infrastructure or workflows are heading.
  * Category creation: how this milestone exemplifies a broader movement (e.g. edge computing, agentic workflows, deterministic guarantees).
  * Contrarian thesis: what traditional industry consensus gets wrong and how this architecture proves it.
- Tone: Thought-provoking, high intellectual density, macro-focused, anchored by the reality of this release.`,

  product: `ROLE: PRODUCT & UX PERSPECTIVE
- Target Audience: End users, product designers, everyday practitioners whose daily work changes.
- Core Topics:
  * User workflow friction eliminated: before-and-after breakdown of steps, clicks, or cognitive load.
  * Usability trade-offs: what was prioritized (e.g. speed over configurability, strict typing over flexibility).
  * Human day-to-day impact: how this eliminates frustrating papercuts from the daily user routine.
- Tone: Empathetic, detail-oriented about ergonomics, human-centered, grounded in real daily habits.`,
};

/**
 * Formats milestone context into a clean text block for injection into prompts.
 */
export function formatMilestoneContext(norm: NormalizedMilestone): string {
  const parts: string[] = [];

  parts.push(`MILESTONE TITLE: ${norm.title}`);
  parts.push(`AUTHOR: ${norm.author.name}${norm.author.username ? ` (@${norm.author.username})` : ''}`);

  if (norm.changelogSummary) {
    parts.push(`CHANGELOG / RELEASE SUMMARY:\n${norm.changelogSummary}`);
  }

  if (norm.issueReferences.length > 0) {
    parts.push(`ISSUE REFERENCES / PRs: ${norm.issueReferences.join(', ')}`);
  }

  if (norm.technicalDetails) {
    const td = norm.technicalDetails;
    const tdParts: string[] = [];
    if (td.architecture) tdParts.push(`Architecture: ${td.architecture}`);
    if (td.tradeoffs) tdParts.push(`Trade-offs: ${td.tradeoffs}`);
    if (td.benchmarks) tdParts.push(`Benchmarks: ${td.benchmarks}`);
    if (td.whatAlmostBroke) tdParts.push(`What Almost Broke: ${td.whatAlmostBroke}`);
    if (td.failureModes) tdParts.push(`Failure Modes: ${td.failureModes}`);
    if (tdParts.length > 0) {
      parts.push(`TECHNICAL DETAILS:\n${tdParts.map((l) => `- ${l}`).join('\n')}`);
    }
  }

  if (norm.businessMetrics) {
    const bm = norm.businessMetrics;
    const bmParts: string[] = [];
    if (bm.painSolved) bmParts.push(`Pain Solved: ${bm.painSolved}`);
    if (bm.metricsImproved) bmParts.push(`Metrics Improved: ${bm.metricsImproved}`);
    if (bm.buyerRelevance) bmParts.push(`Buyer Relevance: ${bm.buyerRelevance}`);
    if (bm.roi) bmParts.push(`ROI: ${bm.roi}`);
    if (bmParts.length > 0) {
      parts.push(`BUSINESS & GTM METRICS:\n${bmParts.map((l) => `- ${l}`).join('\n')}`);
    }
  }

  if (norm.productWorkflow) {
    const pw = norm.productWorkflow;
    const pwParts: string[] = [];
    if (pw.frictionEliminated) pwParts.push(`Friction Eliminated: ${pw.frictionEliminated}`);
    if (pw.usabilityTradeoffs) pwParts.push(`Usability Trade-offs: ${pw.usabilityTradeoffs}`);
    if (pw.dayToDayImpact) pwParts.push(`Day-to-Day Impact: ${pw.dayToDayImpact}`);
    if (pwParts.length > 0) {
      parts.push(`PRODUCT & USER WORKFLOW:\n${pwParts.map((l) => `- ${l}`).join('\n')}`);
    }
  }

  if (norm.visionaryThesis) {
    parts.push(`VISIONARY THESIS: ${norm.visionaryThesis}`);
  }

  if (norm.openRoles.length > 0) {
    parts.push(`ACTIVE OPEN ROLES: ${norm.openRoles.join(', ')}`);
  }

  if (norm.targetUrl) {
    parts.push(`TARGET DESTINATION URL (FOR FIRST COMMENT ONLY): ${norm.targetUrl}`);
  }

  parts.push(`MEMBER TRACKING SLUG: ${norm.memberSlug}`);
  parts.push(`EDGE REDIRECT HOST: ${norm.redirectHost}`);

  return parts.join('\n\n');
}

/**
 * Generate a prompt for a single perspective role.
 */
export function generateRolePrompt(
  role: PerspectiveRole,
  milestone: MilestonePayload,
  options: PromptOptions = {}
): string {
  const norm = normalizeMilestone(milestone);
  const minWords = options.minWords ?? 150;
  const maxWords = options.maxWords ?? 300;

  let prompt = `${getSystemPrompt()}

---

${ROLE_GUIDELINES[role]}

---

INPUT MILESTONE:
${formatMilestoneContext(norm)}
`;

  if (norm.styleSample || options.styleSample) {
    const sample = options.styleSample || norm.styleSample;
    prompt += `
---

AUTHOR WRITING STYLE SAMPLE:
"${sample}"

Match this author's natural voice, sentence cadence, paragraph rhythm, and technical vocabulary. Avoid sounding like a template.
`;
  }

  if (options.customDirectives) {
    prompt += `
---

CUSTOM DIRECTIVES:
${options.customDirectives}
`;
  }

  prompt += `
---

TASK:
Write the ${role.toUpperCase()} perspective post now.

OUTPUT REQUIREMENTS:
1. post_body: 150 to 300 words. Strictly link-free. No corporate hype. No forbidden emojis (🚀, 🔥, 🎉, 💪). No opening rhetorical questions.
2. title: A high-signal 3 to 7 word headline describing this angle.

Return JSON in this format:
{
  "role": "${role}",
  "title": "Angle Headline Here",
  "post_body": "Post text here without any links (${minWords}-${maxWords} words)..."
}
`;

  return prompt;
}

/**
 * Generate the master quintuple-perspective prompt producing all 5 perspectives in one pass.
 */
export function generateQuintuplePrompt(
  milestone: MilestonePayload,
  options: PromptOptions = {}
): string {
  const norm = normalizeMilestone(milestone);
  const minWords = options.minWords ?? 150;
  const maxWords = options.maxWords ?? 300;

  let prompt = `${getSystemPrompt()}

---

ROLES TO GENERATE:
1. builder:
${ROLE_GUIDELINES.builder}

2. gtm:
${ROLE_GUIDELINES.gtm}

3. talent:
${ROLE_GUIDELINES.talent}

4. visionary:
${ROLE_GUIDELINES.visionary}

5. product:
${ROLE_GUIDELINES.product}

---

INPUT MILESTONE:
${formatMilestoneContext(norm)}
`;

  if (norm.styleSample || options.styleSample) {
    const sample = options.styleSample || norm.styleSample;
    prompt += `
---

AUTHOR WRITING STYLE SAMPLE:
"${sample}"

Analyze this author's natural rhythm and sentence cadence. Emulate their personal voice across all five angles while strictly enforcing role separation.
`;
  }

  if (options.customDirectives) {
    prompt += `
---

CUSTOM DIRECTIVES:
${options.customDirectives}
`;
  }

  prompt += `
---

TASK:
Generate all five distinct perspectives for this milestone.

STRICT VALIDATION RULES:
1. Each perspective's post_body must be between ${minWords} and ${maxWords} words.
2. post_body MUST BE 100% LINK-FREE. Do not include URLs or markdown links anywhere in post_body.
3. Absolutely NO corporate hype words ("game-changer", "supercharge", "delve", "excited to announce", etc.).
4. Absolutely NO forbidden emojis (🚀, 🔥, 🎉, 💪).
5. Absolutely NO rhetorical question openers ("Have you ever wondered...?").

Return strictly valid JSON matching this schema:
{
  "perspectives": {
    "builder": {
      "title": "Angle Headline",
      "post_body": "Post copy without links (${minWords}-${maxWords} words)..."
    },
    "gtm": {
      "title": "Angle Headline",
      "post_body": "Post copy without links (${minWords}-${maxWords} words)..."
    },
    "talent": {
      "title": "Angle Headline",
      "post_body": "Post copy without links (${minWords}-${maxWords} words)..."
    },
    "visionary": {
      "title": "Angle Headline",
      "post_body": "Post copy without links (${minWords}-${maxWords} words)..."
    },
    "product": {
      "title": "Angle Headline",
      "post_body": "Post copy without links (${minWords}-${maxWords} words)..."
    }
  }
}
`;

  return prompt;
}
