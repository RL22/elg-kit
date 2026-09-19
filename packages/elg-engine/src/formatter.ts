/**
 * @file formatter.ts
 * Formatter and Link Separation Engine:
 * Enforces the link placement policy by stripping all links from post_body
 * and generating the attributed go.company.com/e/:member shortlink for first_comment.
 */

import { filterAntiCringe } from './anti-cringe.js';
import {
  FormatPostOptions,
  PerspectiveOutput,
  PerspectiveRole,
} from './types.js';

export const DEFAULT_REDIRECT_HOST = 'go.company.com';

const URL_REGEX = /(?:https?:\/\/|www\.)[^\s)\]]+/gi;
const MD_LINK_REGEX = /\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^\s)]+)\)/gi;

/**
 * Strip all URLs and markdown links from text, keeping markdown anchor text.
 * Returns the cleaned link-free text and the list of extracted URLs.
 */
export function stripLinks(text: string): { cleaned: string; extractedLinks: string[] } {
  const extractedLinks: string[] = [];

  // Pass 1: Extract and replace markdown links [text](url) -> text
  let cleaned = text.replace(MD_LINK_REGEX, (_match, anchorText, url) => {
    if (!extractedLinks.includes(url)) {
      extractedLinks.push(url);
    }
    return anchorText;
  });

  // Pass 2: Extract and remove bare URLs
  cleaned = cleaned.replace(URL_REGEX, (match) => {
    if (!extractedLinks.includes(match)) {
      extractedLinks.push(match);
    }
    return '';
  });

  // Clean trailing artifact punctuation and extra spaces
  cleaned = cleaned
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .replace(/\[\s*\]/g, '')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    cleaned,
    extractedLinks,
  };
}

/**
 * Construct the hardened edge redirect URL:
 * https://go.company.com/e/:member?url=<destination_url>
 */
export function buildAttributedUrl(
  memberSlug: string,
  targetUrl?: string,
  redirectHost: string = DEFAULT_REDIRECT_HOST
): string {
  const cleanHost = redirectHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const cleanSlug = memberSlug.trim().toLowerCase().replace(/^@/, '');
  
  let url = `https://${cleanHost}/e/${cleanSlug}`;
  if (targetUrl && targetUrl.trim()) {
    url += `?url=${encodeURIComponent(targetUrl.trim())}`;
  }
  return url;
}

/**
 * Generate role-specific contextual first comment callouts.
 */
export function getRoleCommentPrefix(role: PerspectiveRole): string {
  switch (role) {
    case 'builder':
      return 'Code, architecture docs, and release notes:';
    case 'gtm':
      return 'Explore the customer use cases and benchmarks:';
    case 'talent':
      return 'See open engineering roles and team stack:';
    case 'visionary':
      return 'Read our full architectural thesis and roadmap:';
    case 'product':
      return 'Check out the new workflow and interactive guide:';
    default:
      return 'Full details and documentation:';
  }
}

/**
 * Format first comment containing attributed redirect URL.
 */
export function formatFirstComment(
  memberSlug: string,
  targetUrl?: string,
  redirectHost: string = DEFAULT_REDIRECT_HOST,
  role?: PerspectiveRole
): string {
  const link = buildAttributedUrl(memberSlug, targetUrl, redirectHost);
  const prefix = role ? getRoleCommentPrefix(role) : 'Full release notes and documentation:';
  return `🔗 ${prefix} ${link}`;
}

/**
 * Format a perspective post draft into strictly link-free post_body and first_comment.
 */
export function formatPerspectivePost(
  rawText: string,
  options: FormatPostOptions
): PerspectiveOutput {
  const {
    role,
    title = `${role.toUpperCase()} Perspective`,
    memberSlug,
    targetUrl,
    redirectHost = DEFAULT_REDIRECT_HOST,
    antiCringeOptions = {},
  } = options;

  // Step 1: Strip links first so links don't count towards word budget or hype
  const { cleaned: linkFreeText, extractedLinks } = stripLinks(rawText);

  // If targetUrl wasn't provided, use the first link extracted from the draft if available
  const resolvedTargetUrl = targetUrl || (extractedLinks.length > 0 ? extractedLinks[0] : undefined);

  // Step 2: Run anti-cringe filter (hyped terms, emojis, rhetorical questions, word budget)
  const filterResult = filterAntiCringe(linkFreeText, antiCringeOptions);

  // Step 3: Format first comment with member attribution
  const firstComment = formatFirstComment(memberSlug, resolvedTargetUrl, redirectHost, role);

  return {
    role,
    title,
    post_body: filterResult.cleaned,
    first_comment: firstComment,
    metadata: {
      word_count: filterResult.wordCount,
      character_count: filterResult.charCount,
      within_word_budget: filterResult.withinBudget,
      detected_buzzwords_removed: filterResult.removedHype,
      forbidden_emojis_removed: filterResult.removedEmojis,
      rhetorical_questions_removed: filterResult.removedRhetorical,
      links_extracted: extractedLinks,
    },
  };
}
