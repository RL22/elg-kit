/**
 * @file retrospective.js
 * Deterministic Tier 0 Retrospective Formatter for 90/180-day production milestones.
 * Zero external dependencies.
 */

import { trimToCeiling } from '../../shared/word-budget.js';

/**
 * Compiles a structured retrospective post body capped at 300 words (150 is a soft target; drafts are never padded).
 * @param {object} params
 * @param {string} params.releaseName
 * @param {number} params.daysInProduction
 * @param {string} params.originalThesis
 * @param {string} params.metricsDelta
 * @param {string} params.unexpectedEdgeCases
 * @param {string} params.architecturalTakeaway
 * @returns {string} Clean post body without external URLs.
 */
export function compileRetrospectiveBody({
  releaseName,
  daysInProduction = 180,
  originalThesis,
  metricsDelta,
  unexpectedEdgeCases,
  architecturalTakeaway
}) {
  let paragraphs = [
    `${daysInProduction} days ago, we shipped ${releaseName}. The original architectural thesis was straightforward: ${originalThesis}.`,
    `Production reality under live workloads gave us definitive telemetry: ${metricsDelta}. Our continuous observability confirmed that shifting state resolution closer to the network edge radically lowered latency variance.`,
    `However, the hardest operational surprise was not raw throughput. We uncovered subtle edge cases around ${unexpectedEdgeCases}. Handling network partitions across multi-region edge points forced us to redesign our synchronization semantics from the ground up.`,
    `Our principal architectural takeaway: ${architecturalTakeaway}. In high-concurrency distributed systems, clever abstractions almost always conceal hidden operational costs. Simplicity, deterministic state transitions, and explicit error bounds beat distributed consensus every time.`
  ];

  return trimToCeiling(paragraphs.join('\n\n'));
}
