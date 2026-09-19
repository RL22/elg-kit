/**
 * @file briefer.js
 * Deterministic Tier 0 Executive Brief and Milestone Memo generator.
 * Zero external dependencies.
 */

import { trimToCeiling } from '../../shared/word-budget.js';

/**
 * Compiles a clean executive digest memo capped at 300 words (150 is a soft target; drafts are never padded).
 * @param {object} params
 * @param {string} params.period
 * @param {number} params.shippedCount
 * @param {string[]} params.topWins
 * @param {object} params.kpiMetrics
 * @returns {string} Clean memo body without links.
 */
export function compileBriefBody({ period, shippedCount, topWins, kpiMetrics }) {
  const winsText = topWins.map(w => `• ${w}`).join('\n');
  let paragraphs = [
    `Executive Engineering & Architecture Update (${period}):`,
    `Over the past operating cycle, our engineering organization shipped ${shippedCount} verified production milestones across our core infrastructure rails:`,
    winsText,
    `Key operational performance indicators: p99 latency ${kpiMetrics.latencyDelta}, overall infrastructure unit economics ${kpiMetrics.infrastructureCostDelta}, and aggregate system availability measured at ${kpiMetrics.uptime}.`,
    `By prioritizing foundational system architecture, deterministic edge routing, and automated regression verification, we have substantially expanded our transaction capacity while reducing baseline operating expenditures.`
  ];

  return trimToCeiling(paragraphs.join('\n\n'));
}
