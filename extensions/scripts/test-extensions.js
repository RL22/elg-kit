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
import { trimToCeiling, wordBudgetStatus, countWords, WORD_CEILING, WORD_TARGET_MIN } from '../shared/word-budget.js';

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

  describe('Shared: word budget contract', () => {
    test('exposes a 150-word soft target and a 300-word hard ceiling', () => {
      assert.equal(WORD_TARGET_MIN, 150);
      assert.equal(WORD_CEILING, 300);
    });

    test('leaves text at or under the ceiling untouched, including paragraph breaks', () => {
      const text = 'First paragraph here.\n\nSecond paragraph here.';
      assert.equal(trimToCeiling(text), text);
    });

    test('trims text over the ceiling at a sentence boundary', () => {
      const sentence = 'This sentence has exactly seven words in it. ';
      const long = sentence.repeat(60).trim();
      assert.ok(countWords(long) > WORD_CEILING);
      const trimmed = trimToCeiling(long);
      assert.ok(countWords(trimmed) <= WORD_CEILING);
      assert.ok(trimmed.endsWith('.'));
      assert.ok(!trimmed.endsWith('This sentence has exactly seven words in it'));
    });

    test('an exactly-300-word text is returned unchanged', () => {
      const exact = Array.from({ length: WORD_CEILING }, (_, i) => `w${i}`).join(' ');
      assert.equal(trimToCeiling(exact), exact);
    });

    test('trims CRLF text at a sentence end instead of mid-sentence', () => {
      const para = 'This sentence has exactly seven words in it. '.repeat(20).trim();
      const long = Array.from({ length: 4 }, () => para).join('\r\n\r\n');
      assert.ok(countWords(long) > WORD_CEILING);
      const trimmed = trimToCeiling(long);
      assert.ok(countWords(trimmed) <= WORD_CEILING);
      assert.ok(/in it\.$/.test(trimmed), `expected a clean sentence end, got: ...${trimmed.slice(-30)}`);
    });

    test('keeps a closing quote when the last sentence ends inside quotation marks', () => {
      const sentence = 'She said the fix was "simple and boring." ';
      const long = sentence.repeat(60).trim();
      const trimmed = trimToCeiling(long);
      assert.ok(countWords(trimmed) <= WORD_CEILING);
      assert.ok(trimmed.endsWith('boring."'), `got: ...${trimmed.slice(-20)}`);
    });

    test('text with no sentence ends is cut at the ceiling and closed with a period', () => {
      const noEnds = Array.from({ length: 400 }, (_, i) => `word${i}`).join(' ');
      const trimmed = trimToCeiling(noEnds);
      assert.ok(countWords(trimmed) <= WORD_CEILING);
      assert.ok(trimmed.endsWith('.'));
    });

    test('flags drafts below the soft target without failing them', () => {
      const status = wordBudgetStatus('Short honest draft.');
      assert.equal(status.belowTarget, true);
      assert.equal(status.overCeiling, false);
    });
  });

  describe('Generators never pad short drafts with filler', () => {
    const FILLER = [
      'Customer success teams report zero operational regressions',
      'Our profiling confirmed that removing unnecessary network hops',
      'Their work exemplifies how deep craftsmanship',
      'We instrumented end-to-end tracing across every edge node',
      'Our technical teams continue to operate with high autonomy'
    ];

    test('a short repost stays short, is flagged below target, and contains no canned filler', () => {
      const adapted = boundAdaptedBody('We cut p99 latency from 240ms to 18ms.', 'gtm');
      assert.equal(wordBudgetStatus(adapted).belowTarget, true);
      assert.ok(adapted.includes('240ms to 18ms'));
      for (const line of FILLER) assert.ok(!adapted.includes(line), `filler present: ${line}`);
    });

    test('an oversized repost is trimmed to the ceiling without dropping the author input', () => {
      const long = 'Our team rewrote the ingestion path to remove a global lock. '.repeat(80).trim();
      const adapted = boundAdaptedBody(long, 'talent');
      assert.ok(countWords(adapted) <= WORD_CEILING);
      assert.ok(adapted.includes('rewrote the ingestion path'));
    });

    test('kudos, AMA, brief, and retrospective outputs contain no canned filler', () => {
      const outputs = [
        compileKudosBody({ nomineeHandle: 'marcus', nominatorHandle: 'jordan', achievementSummary: 'fixing a buffer race' }),
        compileFaqBody({ question: 'Why gRPC?', answeredBy: '@elena', technicalSummary: 'Binary framing cut CPU by 35%.' }),
        compileBriefBody({ period: 'Q3', shippedCount: 3, topWins: ['a', 'b'], kpiMetrics: { latencyDelta: '-5%', infrastructureCostDelta: '-2%', uptime: '99.9%' } }),
        compileRetrospectiveBody({ releaseName: 'X', daysInProduction: 90, originalThesis: 't', metricsDelta: 'm', unexpectedEdgeCases: 'e', architecturalTakeaway: 'k' })
      ];
      for (const body of outputs) {
        for (const line of FILLER) assert.ok(!body.includes(line), `filler present: ${line}`);
        assert.equal(wordBudgetStatus(body).belowTarget, true, 'short inputs must stay short instead of being padded to 150');
      }
    });

    test('output length tracks the input: a longer input yields a longer draft, not the same padded length', () => {
      const short = compileKudosBody({ nomineeHandle: 'marcus', nominatorHandle: 'jordan', achievementSummary: 'fixing a race' });
      const longer = compileKudosBody({ nomineeHandle: 'marcus', nominatorHandle: 'jordan', achievementSummary: 'fixing a race condition in the buffer pool that only appeared under sustained write load across regions' });
      assert.ok(countWords(longer) > countWords(short));
    });
  });

  describe('Core: Repost Adapter', () => {
    test('formats adapted body under the 300-word ceiling and eliminates links', () => {
      const rawText = 'We refactored our stream pipeline to use zero-copy buffers. Latency fell 60%. Visit https://example.com for docs.';
      const adapted = boundAdaptedBody(rawText, 'gtm');
      const words = adapted.split(/\s+/).filter(Boolean).length;

      assert.ok(words > 0 && words <= WORD_CEILING, `Word count ${words} exceeds the ${WORD_CEILING}-word ceiling`);
      assert.ok(!adapted.includes('https://example.com'));
    });

    test('formats dual attribution properly', () => {
      const comment = formatDualAttribution('alex', 'https://go.corp.com/e/dan', 'gtm');
      assert.ok(comment.includes('@alex'));
      assert.ok(comment.includes('https://go.corp.com/e/dan'));
    });
  });

  describe('Extension Pack: Rebound Retrospective', () => {
    test('compiles retrospective body under the 300-word ceiling', () => {
      const body = compileRetrospectiveBody({
        releaseName: 'Edge Gateway v2',
        daysInProduction: 180,
        originalThesis: 'cutting microVM startup time under 5ms',
        metricsDelta: 'p99 dropped by 82%',
        unexpectedEdgeCases: 'TLS handshake overhead in cross-continent edge points',
        architecturalTakeaway: 'persistent connection pooling dominates runtime speed'
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words > 0 && words <= WORD_CEILING, `Word count ${words} exceeds the ${WORD_CEILING}-word ceiling`);
      assert.ok(body.includes('180 days ago'));
    });
  });

  describe('Extension Pack: Kudos Spotlight', () => {
    test('extracts nominee mentions and compiles post body under the 300-word ceiling', () => {
      const { handle, cleanedText } = extractNominee('<@U98765|marcus> for fixing the race condition in the buffer');
      assert.equal(handle, 'marcus');
      assert.equal(cleanedText, 'for fixing the race condition in the buffer');

      const body = compileKudosBody({
        nomineeHandle: handle,
        nominatorHandle: 'jordan',
        achievementSummary: cleanedText
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words > 0 && words <= WORD_CEILING, `Word count ${words} exceeds the ${WORD_CEILING}-word ceiling`);
      assert.ok(body.includes('marcus'));
    });
  });

  describe('Extension Pack: AMA & Brief', () => {
    test('compiles AMA FAQ body under the 300-word ceiling', () => {
      const body = compileFaqBody({
        question: 'Why did we drop GraphQL for gRPC?',
        answeredBy: '@elena',
        technicalSummary: 'Binary protobuf serialization reduced CPU consumption by 35% on high-throughput microservices.'
      });

      const words = body.split(/\s+/).filter(Boolean).length;
      assert.ok(words > 0 && words <= WORD_CEILING, `Word count ${words} exceeds the ${WORD_CEILING}-word ceiling`);
      assert.ok(body.includes('Why did we drop GraphQL for gRPC'));
    });

    test('compiles Executive Brief body under the 300-word ceiling', () => {
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
      assert.ok(words > 0 && words <= WORD_CEILING, `Word count ${words} exceeds the ${WORD_CEILING}-word ceiling`);
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
