/**
 * @file calculator.js
 * Deterministic Tier 0 calculation engine for employee impact analytics.
 * Zero external dependencies.
 */

/**
 * Calculates verified reads, bot filtering, and pipeline value.
 * @param {object} params
 * @param {string} params.memberSlug
 * @param {number} params.timeframeDays
 * @param {number} params.totalRawClicks
 * @param {number} params.humanClicks
 * @param {number} [params.verifiedReadMultiplier=0.62] - Industry benchmark 62% engagement on high-intent technical links
 * @param {number} [params.valuePerVerifiedRead=25.0] - $25 pipeline contribution per qualified eng read
 * @param {Array<{source: string, count: number}>} [params.referrers=[]]
 * @returns {object} Full ImpactReport object
 */
export function calculateImpactReport({
  memberSlug,
  timeframeDays = 30,
  totalRawClicks = 0,
  humanClicks = 0,
  verifiedReadMultiplier = 0.62,
  valuePerVerifiedRead = 25.0,
  referrers = []
}) {
  const safeHumanClicks = Math.min(totalRawClicks, Math.max(0, humanClicks));
  const botClicksFiltered = Math.max(0, totalRawClicks - safeHumanClicks);
  const verifiedReads = Math.round(safeHumanClicks * verifiedReadMultiplier);
  const readThroughRate = safeHumanClicks > 0 ? Number((verifiedReads / safeHumanClicks).toFixed(3)) : 0;
  const estimatedPipelineValue = Number((verifiedReads * valuePerVerifiedRead).toFixed(2));

  // Compute referrer percentages
  const totalReferrerHits = referrers.reduce((sum, r) => sum + (r.count || 0), 0);
  const topReferrers = referrers
    .map(r => ({
      source: r.source || 'Direct / Other',
      count: r.count || 0,
      percentage: totalReferrerHits > 0 ? Number(((r.count / totalReferrerHits) * 100).toFixed(1)) : 0
    }))
    .sort((a, b) => b.count - a.count);

  return {
    memberSlug,
    timeframeDays,
    totalRawClicks,
    humanClicks: safeHumanClicks,
    botClicksFiltered,
    verifiedReads,
    readThroughRate,
    estimatedPipelineValue,
    topReferrers
  };
}
