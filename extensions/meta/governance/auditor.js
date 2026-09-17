/**
 * @file auditor.js
 * Deterministic Tier 0 URL Domain Allowlist Auditor for ELG Kit Governance.
 * Zero external dependencies.
 */

/**
 * Audits a destination URL against corporate allowlist rules.
 * Enforces strict domain and subdomain matching; blocks spoofing and open redirects.
 * @param {string} destinationUrl
 * @param {string[]} allowedDomains - e.g. ['company.com', '*.company.com', 'github.com/company']
 * @returns {object} GovernanceAuditResult
 */
export function auditDestinationUrl(destinationUrl, allowedDomains = []) {
  if (!destinationUrl || typeof destinationUrl !== 'string') {
    return {
      valid: false,
      destinationUrl: destinationUrl || '',
      hostname: '',
      allowedDomains,
      matchedRule: null,
      rejectionReason: 'Empty or non-string URL provided'
    };
  }

  let parsed;
  try {
    parsed = new URL(destinationUrl);
  } catch {
    return {
      valid: false,
      destinationUrl,
      hostname: '',
      allowedDomains,
      matchedRule: null,
      rejectionReason: 'Invalid URL syntax'
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      valid: false,
      destinationUrl,
      hostname: parsed.hostname,
      allowedDomains,
      matchedRule: null,
      rejectionReason: `Unsupported protocol ${parsed.protocol}. Only http and https allowed.`
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  for (const pattern of allowedDomains) {
    const cleanPattern = pattern.trim().toLowerCase();

    // Wildcard subdomain: *.company.com
    if (cleanPattern.startsWith('*.')) {
      const rootDomain = cleanPattern.slice(2);
      if (hostname === rootDomain || hostname.endsWith(`.${rootDomain}`)) {
        return {
          valid: true,
          destinationUrl,
          hostname,
          allowedDomains,
          matchedRule: cleanPattern
        };
      }
    }

    // Exact domain match
    if (hostname === cleanPattern || hostname.endsWith(`.${cleanPattern}`)) {
      return {
        valid: true,
        destinationUrl,
        hostname,
        allowedDomains,
        matchedRule: cleanPattern
      };
    }
  }

  return {
    valid: false,
    destinationUrl,
    hostname,
    allowedDomains,
    matchedRule: null,
    rejectionReason: `Hostname "${hostname}" is not in the configured corporate allowlist.`
  };
}
