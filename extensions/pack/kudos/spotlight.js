/**
 * @file spotlight.js
 * Deterministic Tier 0 Peer Praise and Craft Spotlight generator.
 * Zero external dependencies.
 */

import { trimToCeiling } from '../../shared/word-budget.js';

/**
 * Parses user mentions <@U12345|username> or @username from text.
 * @param {string} text
 * @returns {{ handle: string, cleanedText: string }}
 */
export function extractNominee(text) {
  if (!text) return { handle: 'colleague', cleanedText: '' };

  const slackMention = text.match(/<@([A-Z0-9]+)(?:\|([^>]+))?>/);
  if (slackMention) {
    const handle = slackMention[2] || slackMention[1];
    const cleanedText = text.replace(slackMention[0], '').trim();
    return { handle, cleanedText };
  }

  const rawMention = text.match(/@([a-zA-Z0-9_.-]+)/);
  if (rawMention) {
    const handle = rawMention[1];
    const cleanedText = text.replace(rawMention[0], '').trim();
    return { handle, cleanedText };
  }

  return { handle: 'colleague', cleanedText: text.trim() };
}

/**
 * Compiles a peer craft spotlight post capped at 300 words (150 is a soft target; drafts are never padded).
 * @param {object} params
 * @param {string} params.nomineeHandle
 * @param {string} params.nominatorHandle
 * @param {string} params.achievementSummary
 * @returns {string} Clean post body without links.
 */
export function compileKudosBody({ nomineeHandle, nominatorHandle, achievementSummary }) {
  let paragraphs = [
    `High-craft engineering is rarely about flashy rewrites or buzzword adoption—it is defined by the relentless technical discipline to solve intricate systems problems quietly and thoroughly.`,
    `This week, ${nomineeHandle} tackled ${achievementSummary}. Rather than applying superficial band-aids or kicking the can down the road, they traced the issue down to the root concurrency boundaries, verified edge behavior with automated tests, and hardened our production pipeline against future regression.`,
    `What stands out most is the clarity of communication and care for code hygiene. They documented the trade-offs, added regression suites to CI, and walked the team through the architecture during post-incident review.`,
    `Building alongside engineers who treat operational reliability and architectural simplicity as core virtues is what makes our culture special. Huge appreciation to colleagues who continually raise the technical baseline for everyone around them.`
  ];

  return trimToCeiling(paragraphs.join('\n\n'));
}
