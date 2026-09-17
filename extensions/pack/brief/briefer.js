/**
 * @file briefer.js
 * Deterministic Tier 0 Executive Brief and Milestone Memo generator.
 * Zero external dependencies.
 */

/**
 * Compiles a clean executive digest memo bounded to 150-200 words.
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

  const expansionPool = [
    `Our technical teams continue to operate with high autonomy, owning features from initial system RFC through real-time production telemetry and incident post-mortems.`,
    `This rigorous operational discipline ensures our product moats compound sustainably without accumulating unmonitored technical debt or operational drag.`,
    `We intentionally align platform engineering milestones with customer reliability goals, turning technical rigor directly into enterprise retention and competitive differentiation.`,
    `Looking ahead, our roadmap focuses on expanding automated governance guardrails to empower every team member to innovate with confidence.`
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
