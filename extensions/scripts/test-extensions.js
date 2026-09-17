import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Module imports
import { scanDlp } from '../core/guard/scanner.js';
import { scoreMessageSignal, rankMessages } from '../core/suggest/miner.js';
import { calculateImpactReport } from '../core/impact/calculator.js';
import { boundAdaptedBody, formatDualAttribution } from '../core/repost/adapter.js';
import { compileRetrospectiveBody } from '../pack/rebound/retrospective.js';
import { extractNominee, compileKudosBody } from '../pack/kudos/spotlight.js';
import { compileFaqBody } from '../pack/ama/synthesizer.js';
import { compileBriefBody } from '../pack/brief/briefer.js';
import { matchAdvocatesForTopic } from '../meta/cohort/roster.js';
import { auditDestinationUrl } from '../meta/governance/auditor.js';

describe('ELG Kit Extensions Test Suite', () => {

  describe('Core: Guard DLP Scanner', () => {
    test('detects and redacts AWS keys, Slack tokens, and JWTs', () => {
      const sensitiveText = 'Deploying using AKIAIOSFODNN7EXAMPLE and bot token xoxb-1234567890-1234567890-abcdefg on internal host api.corp with JWT eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignatureNow';
      const result = scanDlp(sensitiveText);

      assert.equal(result.clean, false);
      assert.ok(result.riskScore >= 90);
      assert.equal(result.findings.length, 4);
      assert.ok(result.sanitizedText.includes('[REDACTED_AWS_KEY]'));
      assert.ok(result.sanitizedText.includes('[REDACTED_SLACK_TOKEN]'));
      assert.ok(result.sanitizedText.includes('[REDACTED_JWT_TOKEN]'));
      assert.ok(result.sanitizedText.includes('[INTERNAL_HOST]'));
    });

    test('passes clean engineering text without secrets', () => {
      const cleanText = 'We optimized SQLite p99 query latency by removing redundant json_extract calls.';
      const result = scanDlp(cleanText);

      assert.equal(result.clean, true);
      assert.equal(result.riskScore, 0);
      assert.equal(result.findings.length, 0);
      assert.equal(result.sanitizedText, cleanText);
    });
  });

  describe('Core: Suggest Miner', () => {
    test('rewards technical keywords, code blocks, and resolution signals', () => {
      const techPost = 'Investigated high latency in our database query pipeline. Turns out the root cause was an unindexed foreign key in the migration:\n```sql\nEXPLAIN QUERY PLAN SELECT * FROM workers;\n```\nSolved by adding composite index.';
      const score = scoreMessageSignal(techPost, 4, 3);
      assert.ok(score >= 80, `Expected score >= 80, got ${score}`);
    });

    test('penalizes conversational fluff and small talk', () => {
      const fluff = 'Hey team, anyone want coffee or lunch? Thanks!';
      const score = scoreMessageSignal(fluff, 1, 0);
      assert.ok(score <= 20, `Expected score <= 20, got ${score}`);
    });

    test('ranks and filters candidate messages', () => {
      const msgs = [
        { ts: '1', channel: 'C1', text: 'Lunch time?' },
        { ts: '2', channel: 'C1', text: 'Root cause of memory leak was unclosed buffer in worker concurrency pool.', replies: 5, reactions: 4 }
      ];
      const ranked = rankMessages(msgs, 40);
      assert.equal(ranked.length, 1);
      assert.equal(ranked[0].ts, '2');
    });
  });

  describe('Core: Impact Calculator', () => {
    test('accurately calculates bot-filtered metrics, read-through, and pipeline attribution', () => {
      const report = calculateImpactReport({
        memberSlug: 'sarah-connor',
        timeframeDays: 30,
        totalRawClicks: 500,
        humanClicks: 300,
        verifiedReadMultiplier: 0.60,
        valuePerVerifiedRead: 20.0,
        referrers: [
          { source: 'LinkedIn', count: 200 },
          { source: 'X', count: 100 }
        ]
      });

      assert.equal(report.memberSlug, 'sarah-connor');
      assert.equal(report.totalRawClicks, 500);
      assert.equal(report.humanClicks, 300);
      assert.equal(report.botClicksFiltered, 200);
      assert.equal(report.verifiedReads, 180);
      assert.equal(report.readThroughRate, 0.6);
      assert.equal(report.estimatedPipelineValue, 3600.0);
      assert.equal(report.topReferrers[0].percentage, 66.7);
    });
  });

  describe('Core: Repost Adapter', () => {
    test('bounds adapted body strictly between 150 and 200 words and eliminates links', () => {
      const rawText = 'We refactored our stream pipeline to use zero-copy buffers. Latency fell 60%. Visit https://example.com for docs.';
      const adapted = boundAdaptedBody(rawText, 'gtm');
      const words = adapted.split(/\s+/).filter(Boolean).length;

      assert.ok(words >= 150 && words <= 200, `Word count ${words} not between 150 and 200`);
      assert.ok(!adapted.includes('https://example.com'));
    });

    test('formats dual attribution properly', () => {
      const comment = formatDualAttribution('alex', 'https://go.corp.com/e/dan', 'gtm');
      assert.ok(comment.includes('@alex'));
      assert.ok(comment.includes('https://go.corp.com/e/dan'));
    });
  });

  describe('Extension Pack: Rebound Retrospective', () => {
    test('compiles retrospective body between 150 and 200 words', () => {
      const body = compileRetrospectiveBody({
        releaseName: 'Edge Gateway v2',
        daysInProduction: 180,
        originalThesis: 'cutting microVM startup time under 5ms',
        metricsDelta: 'p99 dropped by 82%',
        unexpectedEdgeCases: 'TLS handshake overhead in cross-continent edge points',
        architecturalTakeaway: 'persistent connection pooling dominates runtime speed'
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 150 && words <= 200, `Word count ${words} not between 150 and 200`);
      assert.ok(body.includes('180 days ago'));
    });
  });

  describe('Extension Pack: Kudos Spotlight', () => {
    test('extracts nominee mentions and compiles post body between 150 and 200 words', () => {
      const { handle, cleanedText } = extractNominee('<@U98765|marcus> for fixing the race condition in the buffer');
      assert.equal(handle, 'marcus');
      assert.equal(cleanedText, 'for fixing the race condition in the buffer');

      const body = compileKudosBody({
        nomineeHandle: handle,
        nominatorHandle: 'jordan',
        achievementSummary: cleanedText
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 150 && words <= 200, `Word count ${words} not between 150 and 200`);
      assert.ok(body.includes('marcus'));
    });
  });

  describe('Extension Pack: AMA & Brief', () => {
    test('compiles AMA FAQ body between 150 and 200 words', () => {
      const body = compileFaqBody({
        question: 'Why did we drop GraphQL for gRPC?',
        answeredBy: '@elena',
        technicalSummary: 'Binary protobuf serialization reduced CPU consumption by 35% on high-throughput microservices.'
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 150 && words <= 200, `Word count ${words} not between 150 and 200`);
      assert.ok(body.includes('Why did we drop GraphQL for gRPC'));
    });

    test('compiles Executive Brief body between 150 and 200 words', () => {
      const body = compileBriefBody({
        period: 'September 2026',
        shippedCount: 12,
        topWins: [
          'Edge redirect latency reduced to 6ms',
          'Zero DLP token leaks across 40 advocate posts',
          'Enterprise attribution engine connected to Cloudflare D1'
        ],
        kpiMetrics: {
          latencyDelta: '-52%',
          infrastructureCostDelta: '-28%',
          uptime: '99.99%'
        }
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words >= 150 && words <= 200, `Word count ${words} not between 150 and 200`);
      assert.ok(body.includes('September 2026'));
    });
  });

  describe('Admin Meta-Skills: Cohort & Governance', () => {
    test('matches advocates by tag and balances capacity utilization', () => {
      const roster = [
        { userId: 'U1', memberSlug: 'dan', tags: ['infra'], weeklyQuota: 2, sharesThisWeek: 2, active: true },
        { userId: 'U2', memberSlug: 'sara', tags: ['infra', 'ai'], weeklyQuota: 3, sharesThisWeek: 1, active: true },
        { userId: 'U3', memberSlug: 'mike', tags: ['gtm'], weeklyQuota: 2, sharesThisWeek: 0, active: true }
      ];

      const matched = matchAdvocatesForTopic(roster, ['infra']);
      assert.equal(matched.length, 1);
      assert.equal(matched[0].userId, 'U2'); // U1 is full, U3 does not have tag
    });

    test('audits destination URLs against allowlist', () => {
      const allowlist = ['company.com', '*.company.com', 'github.com'];

      assert.equal(auditDestinationUrl('https://company.com/blog/arch', allowlist).valid, true);
      assert.equal(auditDestinationUrl('https://docs.company.com/api', allowlist).valid, true);
      assert.equal(auditDestinationUrl('https://evil-company.com/phish', allowlist).valid, false);
      assert.equal(auditDestinationUrl('https://attacker.com/redirect?url=company.com', allowlist).valid, false);
      assert.equal(auditDestinationUrl('ftp://company.com/file', allowlist).valid, false);
    });
  });

  describe('Schema Integrity Check', () => {
    test('all 11 JSON schema files parse cleanly with valid properties', () => {
      const schemaPaths = [
        'core/guard/schema.json',
        'core/harvest/schema.json',
        'core/suggest/schema.json',
        'core/impact/schema.json',
        'core/repost/schema.json',
        'pack/rebound/schema.json',
        'pack/kudos/schema.json',
        'pack/ama/schema.json',
        'pack/brief/schema.json',
        'meta/cohort/schema.json',
        'meta/governance/schema.json',
        'meta/telemetry/schema.json'
      ];

      for (const relPath of schemaPaths) {
        const fullPath = fileURLToPath(new URL('../' + relPath, import.meta.url));
        const raw = readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        assert.ok(parsed.$schema, `${relPath} missing $schema`);
        assert.ok(parsed.title, `${relPath} missing title`);
        assert.ok(parsed.type === 'object', `${relPath} type is not object`);
      }
    });
  });

});
