/**
 * @file word-budget.js
 * Shared word-budget contract for the deterministic Tier 0 generators.
 * Zero external dependencies.
 *
 * WORD_TARGET_MIN is a soft target: shorter drafts are flagged by wordBudgetStatus()
 * but are never padded with filler. WORD_CEILING is the hard limit: longer drafts are
 * trimmed at a sentence boundary.
 */

export const WORD_TARGET_MIN = 150;
export const WORD_CEILING = 300;

export function countWords(text) {
  return (text || '').split(/\s+/).filter(Boolean).length;
}

/**
 * @param {string} text
 * @returns {{ words: number, belowTarget: boolean, overCeiling: boolean }}
 */
export function wordBudgetStatus(text) {
  const words = countWords(text);
  return { words, belowTarget: words < WORD_TARGET_MIN, overCeiling: words > WORD_CEILING };
}

/**
 * Trims text that exceeds the ceiling, cutting at the last sentence end inside the limit.
 * Text at or under the ceiling is returned unchanged, including paragraph breaks.
 * @param {string} text
 * @param {number} [ceiling]
 * @returns {string}
 */
export function trimToCeiling(text, ceiling = WORD_CEILING) {
  const source = text || '';
  let seen = 0;
  let cut = -1;
  for (const match of source.matchAll(/\S+/g)) {
    seen++;
    if (seen === ceiling) cut = match.index + match[0].length;
  }
  if (seen <= ceiling) return source;

  const head = source.slice(0, cut);
  let lastEnd = -1;
  for (const m of head.matchAll(/[.!?]["')\]]*(?=\s)/g)) lastEnd = m.index + m[0].length;
  if (lastEnd > head.length * 0.6) return head.slice(0, lastEnd).trimEnd();
  return head.replace(/[\s,;:]+$/, '') + '.';
}
