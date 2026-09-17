/**
 * @file spotlight.js
 * Deterministic Tier 0 Peer Praise and Craft Spotlight generator.
 * Zero external dependencies.
 */

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
 * Compiles a peer craft spotlight post bounded to 150-200 words.
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

  const expansionPool = [
    `Their work exemplifies how deep craftsmanship directly protects customer uptime and developer velocity across the entire organization.`,
    `We believe that recognizing engineering rigor openly reinforces the standards that keep our distributed systems resilient at scale.`
  ];

  let fullText = paragraphs.join('\n\n');
  let currentWords = fullText.split(/\s+/).filter(Boolean).length;

  let idx = 0;
  while (currentWords < 150 && idx < expansionPool.length) {
    paragraphs.splice(paragraphs.length - 1, 0, expansionPool[idx]);
    fullText = paragraphs.join('\n\n');
    currentWords = fullText.split(/\s+/).filter(Boolean).length;
    idx++;
  }

  const words = fullText.split(/\s+/).filter(Boolean);
  if (words.length > 200) {
    fullText = words.slice(0, 195).join(' ') + '.';
  }

  return fullText;
}
