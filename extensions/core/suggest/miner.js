/**
 * @file miner.js
 * Deterministic Tier 0 Thread Ranker and Signal Scorer for conversational history.
 * Zero external dependencies.
 */

const TECH_TERMS = [
  'refactor', 'architecture', 'benchmark', 'latency', 'database', 'query',
  'migration', 'deploy', 'incident', 'concurrency', 'async', 'cache',
  'memory', 'scale', 'throughput', 'schema', 'pipeline', 'sharding',
  'replica', 'profiling', 'deadlock', 'kubernetes', 'docker', 'worker'
];

const RESOLUTION_TERMS = [
  'root cause', 'turns out', 'fixed by', 'solved by', 'investigated',
  'measured', 'shipped', 'verified', 'reproduced', 'isolated'
];

const FLUFF_TERMS = [
  'lunch', 'coffee', 'thanks', 'lol', 'good morning', 'sounds good',
  'congrats', 'happy friday', 'will do', '+1', 'bump'
];

/**
 * Calculates deterministic signal score [0 - 100] for a Slack message or thread item.
 * @param {string} text - Message text.
 * @param {number} replyCount - Number of replies in thread.
 * @param {number} reactionCount - Number of emoji reactions.
 * @returns {number} Score between 0 and 100.
 */
export function scoreMessageSignal(text, replyCount = 0, reactionCount = 0) {
  if (!text || typeof text !== 'string' || text.trim().length < 30) {
    return 0;
  }

  const lower = text.toLowerCase();
  let score = 20; // Base score for non-empty text

  // 1. Technical terminology density
  let techHits = 0;
  for (const term of TECH_TERMS) {
    if (lower.includes(term)) techHits++;
  }
  score += Math.min(30, techHits * 10);

  // 2. Code blocks or backticks
  if (/```[\s\S]*?```/.test(text)) {
    score += 25;
  } else if (/`[^`]+`/.test(text)) {
    score += 15;
  }

  // 3. Problem resolution signals
  let resHits = 0;
  for (const term of RESOLUTION_TERMS) {
    if (lower.includes(term)) resHits++;
  }
  score += Math.min(20, resHits * 10);

  // 4. Thread engagement (replies & reactions)
  score += Math.min(15, replyCount * 3 + reactionCount * 2);

  // 5. Fluff deduction
  for (const term of FLUFF_TERMS) {
    if (lower.includes(term)) score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Mines and ranks an array of candidate messages.
 * @param {Array<{ts: string, channel: string, text: string, replies?: number, reactions?: number}>} messages
 * @param {number} minThreshold - Minimum signal score to include (default: 50)
 * @returns {Array<{ts: string, channel: string, text: string, signalScore: number}>}
 */
export function rankMessages(messages, minThreshold = 50) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map(msg => ({
      ts: msg.ts,
      channel: msg.channel,
      text: msg.text,
      signalScore: scoreMessageSignal(msg.text, msg.replies || 0, msg.reactions || 0)
    }))
    .filter(m => m.signalScore >= minThreshold)
    .sort((a, b) => b.signalScore - a.signalScore);
}
