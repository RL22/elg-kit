/**
 * @file anti-cringe.ts
 * Anti-cringe filter: removes corporate hype, forbidden emojis, rhetorical questions,
 * and validates word count budgets.
 */

import { AntiCringeOptions, FilterResult, WordBudgetResult } from './types.js';

/**
 * Standard list of corporate hype phrases and LLM clichés to strip or reject.
 */
export const DEFAULT_BANNED_HYPE_PHRASES: readonly string[] = [
  'excited to announce',
  'thrilled to announce',
  'proud to announce',
  'pleased to announce',
  'happy to announce',
  'delighted to announce',
  'game-changer',
  'game changer',
  'game-changing',
  'game changing',
  'supercharge',
  'supercharged',
  'supercharging',
  'delve',
  'delving',
  'delves',
  'delved',
  'revolutionary',
  'revolutionize',
  'revolutionizing',
  'disrupt',
  'disrupting',
  'disruptive',
  'paradigm shift',
  'synergy',
  'synergies',
  'synergistic',
  'next level',
  'take it to the next level',
  'cutting-edge',
  'cutting edge',
  'state-of-the-art',
  'state of the art',
  'seamless',
  'seamlessly',
  'unleash',
  'unleashing',
  'humbled and honored',
  'humbled to',
  'deeply honored',
  'buckle up',
  'in today\'s fast-paced world',
  'in today\'s fast-paced',
  'move the needle',
  'without further ado',
  'let\'s dive in',
  'dive deep into',
  'dive in',
  'testament to',
  'a testament',
  'tapestry',
  'beacon of',
  'beacon',
  'secret sauce',
  '10x engineer',
  'silver bullet',
  'boil the ocean',
  'low-hanging fruit',
] as const;

/**
 * Forbidden social advocacy emojis:
 * Rocket (🚀), Fire (🔥), Party Popper (🎉), Flexing Bicep (💪)
 */
export const FORBIDDEN_EMOJIS = ['🚀', '🔥', '🎉', '💪'] as const;

export const FORBIDDEN_EMOJI_REGEX = /[\u{1F680}\u{1F525}\u{1F389}\u{1F4AA}(?:\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF})?]/gu;

/**
 * Rhetorical question hooks that start posts with marketing clickbait.
 */
export const RHETORICAL_OPENER_REGEX = /^\s*(?:Have you ever wondered|What if I told you|Ever wonder(?:ed)?|Tired of|Why is it that|Are you ready for|Did you know that)\b[^.?!]*\?\s*/i;

/**
 * Strip forbidden emojis from text and record what was removed.
 */
export function stripForbiddenEmojis(text: string): { cleaned: string; removed: string[] } {
  const removed: string[] = [];
  const cleaned = text.replace(FORBIDDEN_EMOJI_REGEX, (match) => {
    let label = match;
    if (match.includes('🚀')) label = 'rocket (🚀)';
    else if (match.includes('🔥')) label = 'fire (🔥)';
    else if (match.includes('🎉')) label = 'party popper (🎉)';
    else if (match.includes('💪')) label = 'flexing bicep (💪)';
    if (!removed.includes(label)) {
      removed.push(label);
    }
    return '';
  });

  return {
    cleaned: cleaned.replace(/[ \t]{2,}/g, ' '),
    removed,
  };
}

/**
 * Detect corporate hype phrases present in text.
 */
export function detectCorporateHype(text: string, customPhrases?: string[]): string[] {
  const phrases = [...DEFAULT_BANNED_HYPE_PHRASES, ...(customPhrases || [])];
  const detected: string[] = [];

  for (const phrase of phrases) {
    const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      if (!detected.includes(phrase.toLowerCase())) {
        detected.push(phrase.toLowerCase());
      }
    }
  }

  return detected;
}

/**
 * Strip corporate hype terms and LLM clichés from text.
 */
export function stripCorporateHype(
  text: string,
  customPhrases?: string[]
): { cleaned: string; removed: string[] } {
  const phrases = [...DEFAULT_BANNED_HYPE_PHRASES, ...(customPhrases || [])];
  // Sort longest first to avoid partial replacements
  const sortedPhrases = [...phrases].sort((a, b) => b.length - a.length);

  let result = text;
  const removed: string[] = [];

  for (const phrase of sortedPhrases) {
    const escaped = phrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    if (regex.test(result)) {
      if (!removed.includes(phrase.toLowerCase())) {
        removed.push(phrase.toLowerCase());
      }
      result = result.replace(regex, '');
    }
  }

  // Clean up residual artifact spaces, empty parentheticals, and double punctuation
  result = result
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();

  return {
    cleaned: result,
    removed,
  };
}

/**
 * Strip opening rhetorical question hooks from post drafts.
 */
export function stripRhetoricalHooks(text: string): { cleaned: string; removed: string[] } {
  const match = text.match(RHETORICAL_OPENER_REGEX);
  if (match) {
    const removedHook = match[0].trim();
    const cleaned = text.replace(RHETORICAL_OPENER_REGEX, '').trim();
    return {
      cleaned,
      removed: [removedHook],
    };
  }

  return {
    cleaned: text,
    removed: [],
  };
}

/**
 * Calculate word count accurately.
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Enforces character and word count budgets (150 to 300 words).
 */
export function validateWordBudget(
  text: string,
  minWords = 150,
  maxWords = 300
): WordBudgetResult {
  const wordCount = countWords(text);
  const charCount = text.length;

  let status: 'under_budget' | 'in_budget' | 'over_budget' = 'in_budget';
  let message: string | undefined;

  if (wordCount < minWords) {
    status = 'under_budget';
    message = `Post is under budget: ${wordCount} words (target: ${minWords}-${maxWords} words)`;
  } else if (wordCount > maxWords) {
    status = 'over_budget';
    message = `Post is over budget: ${wordCount} words (target: ${minWords}-${maxWords} words)`;
  }

  return {
    valid: status === 'in_budget',
    wordCount,
    charCount,
    minWords,
    maxWords,
    status,
    message,
  };
}

/**
 * Comprehensive anti-cringe filter running all sanitation passes.
 */
export function filterAntiCringe(
  text: string,
  options: AntiCringeOptions = {}
): FilterResult {
  const {
    stripHype = true,
    stripEmojis = true,
    stripRhetorical = true,
    minWords = 150,
    maxWords = 300,
    customBannedWords = [],
  } = options;

  let current = text;
  let removedHype: string[] = [];
  let removedEmojis: string[] = [];
  let removedRhetorical: string[] = [];

  // Pass 1: Strip rhetorical question opener if requested
  if (stripRhetorical) {
    const res = stripRhetoricalHooks(current);
    current = res.cleaned;
    removedRhetorical = res.removed;
  }

  // Pass 2: Strip forbidden emojis
  if (stripEmojis) {
    const res = stripForbiddenEmojis(current);
    current = res.cleaned;
    removedEmojis = res.removed;
  }

  // Pass 3: Strip corporate hype
  if (stripHype) {
    const res = stripCorporateHype(current, customBannedWords);
    current = res.cleaned;
    removedHype = res.removed;
  }

  // Clean double blank lines or spaces
  current = current
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const budget = validateWordBudget(current, minWords, maxWords);

  return {
    cleaned: current,
    removedHype,
    removedEmojis,
    removedRhetorical,
    extractedLinks: [],
    wordCount: budget.wordCount,
    charCount: budget.charCount,
    withinBudget: budget.valid,
  };
}
