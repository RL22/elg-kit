/**
 * @file roster.js
 * Deterministic Tier 0 Cohort Matcher and Load Balancer for ELG Kit.
 * Zero external dependencies.
 */

/**
 * Finds eligible advocates for a topic based on domain tags and remaining weekly quota.
 * @param {Array<object>} roster
 * @param {string[]} topicTags
 * @returns {Array<object>} Filtered and load-balanced list of eligible advocates.
 */
export function matchAdvocatesForTopic(roster, topicTags = []) {
  if (!Array.isArray(roster) || roster.length === 0) return [];
  const normalizedTags = topicTags.map(t => t.toLowerCase());

  return roster
    .filter(member => member.active && (member.weeklyQuota > (member.sharesThisWeek || 0)))
    .filter(member => {
      if (normalizedTags.length === 0) return true;
      return (member.tags || []).some(t => normalizedTags.includes(t.toLowerCase()));
    })
    .sort((a, b) => {
      // Prioritize members with lowest capacity utilization first
      const aUtil = (a.sharesThisWeek || 0) / a.weeklyQuota;
      const bUtil = (b.sharesThisWeek || 0) / b.weeklyQuota;
      return aUtil - bUtil;
    });
}
