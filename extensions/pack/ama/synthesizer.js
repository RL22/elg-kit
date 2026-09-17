/**
 * @file synthesizer.js
 * Deterministic Tier 0 Engineering Q&A and FAQ Synthesizer.
 * Zero external dependencies.
 */

/**
 * Compiles a question-and-answer technical post bounded to 150-200 words.
 * @param {object} params
 * @param {string} params.question
 * @param {string} params.answeredBy
 * @param {string} params.technicalSummary
 * @returns {string} Clean post body without external URLs.
 */
export function compileFaqBody({ question, answeredBy, technicalSummary }) {
  let paragraphs = [
    `Common question we frequently get regarding our infrastructure architecture: "${question.replace(/[?]+$/, '')}?"`,
    `Here is how our engineering team approaches this architectural challenge:`,
    `${technicalSummary}`,
    `Rather than defaulting to industry fashion or adding third-party dependencies, we benchmarked real production workloads across concurrency thresholds. The decisive factors came down to deterministic resource usage, zero-copy serialization, and predictable failure isolation.`,
    `Great systems are never built by stacking trendy abstractions. They are forged by being honest about fundamental performance trade-offs and choosing predictable ergonomics over speculative complexity.`,
    `Detailed architectural decision records and verifiable benchmarks are documented in the discussion thread.`
  ];

  const expansionPool = [
    `Our profiling confirmed that removing unnecessary network hops resolved tail latency variance across high-concurrency client requests.`,
    `Continuous automated verification suites run against every build to guarantee zero architectural regressions in production.`,
    `When teams understand the hardware and network limits of their environment, system designs naturally converge on simpler, more reliable patterns.`,
    `We believe transparent engineering documentation turns internal problem solving into shared organizational knowledge that benefits everyone.`
  ];

  let fullText = paragraphs.join('\n\n');
  let currentWords = fullText.split(/\s+/).filter(Boolean).length;

  let idx = 0;
  while (currentWords < 150 && idx < expansionPool.length) {
    paragraphs.splice(paragraphs.length - 2, 0, expansionPool[idx]);
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
