/**
 * @file scanner.js
 * Deterministic Tier 0 DLP and Secret Scanner for ELG Kit.
 * Zero external dependencies. Uses compiled native RegExp patterns.
 */

export const DLP_RULES = [
  {
    ruleId: 'aws-access-key',
    category: 'aws_secret',
    severity: 'critical',
    regex: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  {
    ruleId: 'slack-token',
    category: 'api_key',
    severity: 'critical',
    regex: /\b(xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9_-]*)\b/g,
    replacement: '[REDACTED_SLACK_TOKEN]'
  },
  {
    ruleId: 'github-token',
    category: 'api_key',
    severity: 'critical',
    regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
    replacement: '[REDACTED_GITHUB_TOKEN]'
  },
  {
    ruleId: 'openai-or-generic-sk',
    category: 'api_key',
    severity: 'critical',
    regex: /\b(sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,})\b/g,
    replacement: '[REDACTED_API_KEY]'
  },
  {
    ruleId: 'private-key-block',
    category: 'private_key',
    severity: 'critical',
    regex: /-----BEGIN\s+[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END\s+[A-Z ]*PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]'
  },
  {
    ruleId: 'jwt-bearer-token',
    category: 'jwt_token',
    severity: 'high',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT_TOKEN]'
  },
  {
    ruleId: 'internal-rfc1918-ip',
    category: 'internal_ip',
    severity: 'medium',
    regex: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[INTERNAL_IP]'
  },
  {
    ruleId: 'internal-corp-hostname',
    category: 'internal_host',
    severity: 'medium',
    regex: /\b[a-zA-Z0-9_-]+\.(?:corp|internal|local|lan|priv|intranet|dev\.internal)\b/gi,
    replacement: '[INTERNAL_HOST]'
  }
];

/**
 * Executes deterministic DLP scan over input text.
 * @param {string} text - Raw post or thread content.
 * @returns {{ clean: boolean, riskScore: number, findings: Array<{ruleId: string, category: string, severity: string, snippet: string, redactedReplacement: string}>, sanitizedText: string }}
 */
export function scanDlp(text) {
  if (!text || typeof text !== 'string') {
    return { clean: true, riskScore: 0, findings: [], sanitizedText: '' };
  }

  let sanitized = text;
  const findings = [];
  let aggregateScore = 0;

  for (const rule of DLP_RULES) {
    // Reset regex state
    rule.regex.lastIndex = 0;
    let match;
    while ((match = rule.regex.exec(text)) !== null) {
      const matchStr = match[0];
      findings.push({
        ruleId: rule.ruleId,
        category: rule.category,
        severity: rule.severity,
        snippet: matchStr.length > 20 ? `${matchStr.slice(0, 6)}...${matchStr.slice(-4)}` : matchStr,
        redactedReplacement: rule.replacement
      });

      if (rule.severity === 'critical') aggregateScore += 50;
      else if (rule.severity === 'high') aggregateScore += 30;
      else if (rule.severity === 'medium') aggregateScore += 15;
      else aggregateScore += 5;
    }

    rule.regex.lastIndex = 0;
    sanitized = sanitized.replace(rule.regex, rule.replacement);
  }

  const finalScore = Math.min(100, aggregateScore);

  return {
    clean: findings.length === 0,
    riskScore: finalScore,
    findings,
    sanitizedText: sanitized
  };
}
