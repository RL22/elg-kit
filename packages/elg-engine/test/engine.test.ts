import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PerspectiveEngine,
  formatEngineResult,
  processPerspective,
  validateEngineResult,
  filterAntiCringe,
  stripForbiddenEmojis,
  stripCorporateHype,
  stripRhetoricalHooks,
  validateWordBudget,
  countWords,
  stripLinks,
  buildAttributedUrl,
  formatFirstComment,
  formatPerspectivePost,
  generateQuintuplePrompt,
  generateRolePrompt,
  getSystemPrompt,
  normalizeMilestone,
  PERSPECTIVE_ROLES,
  MilestonePayload,
} from '../src/index.js';

test('Perspective Engine Unit Test Suite', async (t) => {
  // --------------------------------------------------------------------------
  // Group 1: Schema Output & Normalization
  // --------------------------------------------------------------------------
  await t.test('Schema Output: produces valid quintuple perspective schema', () => {
    const mockMilestone: MilestonePayload = {
      title: 'v2.4 Kernel Bypass Network Driver Release',
      changelog_summary: 'Replaced standard epoll socket polling with io_uring and AF_XDP zero-copy ring buffers.',
      author: {
        name: 'Rodney Lewis',
        username: 'rodney',
      },
      issue_references: ['#412', 'KERN-88'],
      target_url: 'https://company.com/releases/kernel-bypass-v24',
      member_slug: 'rodney',
      technical_details: {
        architecture: 'AF_XDP UMEM memory-mapped queues bypassing Linux kernel networking stack.',
        tradeoffs: 'Higher CPU pinning in exchange for zero jitter and deterministic p99.',
        benchmarks: 'p99 latency dropped from 4.2ms to 85μs under 500k rps.',
        whatAlmostBroke: 'Memory leak in packet descriptor ring during driver teardown.',
      },
      business_metrics: {
        painSolved: 'Network ingress bottlenecks during market opening volatility.',
        metricsImproved: '75% reduction in compute cluster cost; p99 dropped 40x.',
        buyerRelevance: 'Guarantees execution SLA for low-latency fintech clients.',
      },
      product_workflow: {
        frictionEliminated: 'Zero manual sysctl socket tuning needed per bare-metal host.',
        dayToDayImpact: 'Cluster nodes auto-configure ring buffers on boot without ops intervention.',
      },
      open_roles: ['Staff Distributed Systems Engineer', 'Linux Kernel Network Specialist'],
    };

    const mockCompletions = {
      builder: `We spent the last four weeks replacing our standard epoll event loop with io_uring and AF_XDP zero-copy ring buffers.

When throughput hit 500k requests per second during morning volatility, standard kernel socket transitions were eating 35% of total CPU cycles in softirq handlers. We evaluated DPDK first, but maintaining custom out-of-tree kernel modules across hundreds of staging servers wasn't worth the operational debt.

AF_XDP gave us zero-copy packet buffers directly into userspace while keeping standard Linux security policies intact. The hardest bug was a race condition in the descriptor ring cleanup during abrupt worker teardowns—the queue index would desync and drop packets until the host was rebooted. Fixed it by enforcing a clean drain barrier before unmapping the UMEM arena.

Under synthetic stress testing, our p99 ingress latency dropped from 4.2 milliseconds down to 85 microseconds. CPU utilization per node decreased by 40%.`,

      gtm: `Financial trading infrastructure fails when volatility spikes, costing firms thousands of dollars per second in dropped execution windows.

Our v2.4 release directly eliminates the network ingress bottleneck that previously required customers to over-provision bare-metal clusters by 3x just to handle morning market spikes. By switching to userspace packet steering, we achieved a 75% reduction in ingress server footprint while providing a hard 100-microsecond p99 guarantee.

For CTOs and Infrastructure VPs, this transforms an unpredictable latency liability into a verifiable SLA that passes institutional risk audits. Instead of throwing more hardware at market volatility, your infrastructure maintains sub-millisecond predictability without requiring custom proprietary hardware appliances.`,

      talent: `Last month our systems team hit a wall with epoll performance at 500k rps. Instead of patching around the edges, an engineer had full autonomy to prototype an AF_XDP zero-copy driver, benchmark it on real traffic traces, and ship it to production within three weeks.

That is how engineering moves here. Small autonomous squads, direct access to production hardware, and zero tolerance for technical debt. We value engineers who understand what happens beneath the standard library—down in the ring buffers, CPU cache lines, and memory barriers.

We are actively hiring Staff Distributed Systems Engineers and Linux Network Specialists to push our kernel bypass infrastructure even further. If you love dissecting operating system internals and writing code where microseconds actually matter, check out our openings.`,

      visionary: `The conventional wisdom in web infrastructure has been to treat the operating system kernel as an inviolable black box. For two decades, software teams scaled by stacking abstraction layers on top of traditional POSIX sockets.

That paradigm is breaking under modern streaming and low-latency workloads. As network bandwidth shifts from 10G to 100G, the software kernel stack itself has become the primary bottleneck.

The future belongs to kernel-bypass architectures and hardware-cooperative runtimes like io_uring and AF_XDP. We are entering an era where high-performance software must co-design userspace memory layout with network hardware primitives. Today's release is our foundational stake in that transition.`,

      product: `Running high-performance network nodes previously required our customers' infrastructure teams to maintain a fragile 40-line sysctl script across every bare-metal machine. One wrong buffer allocation would trigger silent packet drops during peak traffic.

With v2.4, we completely eliminated the manual tuning workflow. The driver auto-probes the host hardware, calculates optimal UMEM arena boundaries on boot, and binds ring buffers without a single configuration file edit.

Ops engineers no longer need to spend Sunday night tuning socket backlogs or debugging kernel dropped packet counters. The system provides immediate deterministic performance out of the box, turning what was once a multi-day manual setup into an invisible background primitive.`,
    };

    const engine = new PerspectiveEngine();
    const result = engine.formatResult(mockCompletions, mockMilestone);

    // Verify top-level structure
    assert.strictEqual(result.milestone_title, 'v2.4 Kernel Bypass Network Driver Release');
    assert.strictEqual(result.author, 'Rodney Lewis');
    assert.strictEqual(result.member_slug, 'rodney');
    assert.strictEqual(result.redirect_host, 'go.company.com');
    assert.ok(result.generated_at);

    // Verify all 5 perspectives exist
    for (const role of PERSPECTIVE_ROLES) {
      const p = result.perspectives[role];
      assert.ok(p, `Perspective ${role} should exist`);
      assert.strictEqual(p.role, role);
      assert.ok(p.title, `Role ${role} should have a title`);
      assert.ok(p.post_body, `Role ${role} should have a post_body`);
      assert.ok(p.first_comment, `Role ${role} should have a first_comment`);
      assert.ok(p.metadata, `Role ${role} should have metadata`);
      assert.ok(p.metadata.word_count >= 100, `Role ${role} word count should be calculated`);
      assert.ok(p.metadata.character_count > 0);
      assert.strictEqual(typeof p.metadata.within_word_budget, 'boolean');
    }

    // Run validator
    const validation = validateEngineResult(result);
    assert.strictEqual(validation.valid, true, `Result should be valid: ${validation.errors.join(', ')}`);
  });

  await t.test('Schema Output: normalizes both camelCase and snake_case milestone fields', () => {
    const snakeInput: MilestonePayload = {
      title: 'Snake Case Milestone',
      changelog_summary: 'Feature summary here.',
      author: 'Lewis',
      member_slug: 'lewis_dev',
      redirect_host: 'edge.example.com',
      target_url: 'https://example.com/item',
      open_roles: ['Role A'],
      issue_references: ['#1'],
    };

    const norm = normalizeMilestone(snakeInput);
    assert.strictEqual(norm.title, 'Snake Case Milestone');
    assert.strictEqual(norm.changelogSummary, 'Feature summary here.');
    assert.strictEqual(norm.memberSlug, 'lewis_dev');
    assert.strictEqual(norm.redirectHost, 'edge.example.com');
    assert.strictEqual(norm.targetUrl, 'https://example.com/item');
    assert.deepStrictEqual(norm.openRoles, ['Role A']);
    assert.deepStrictEqual(norm.issueReferences, ['#1']);
  });

  // --------------------------------------------------------------------------
  // Group 2: Anti-Cringe Filter
  // --------------------------------------------------------------------------
  await t.test('Anti-Cringe: strips forbidden emojis (🚀, 🔥, 🎉, 💪)', () => {
    const textWithEmojis = 'We just shipped the new compiler 🚀 and performance is straight fire 🔥! Time to celebrate 🎉 and flex 💪 with our new speed 💪🏽.';
    const result = stripForbiddenEmojis(textWithEmojis);

    assert.strictEqual(result.cleaned.includes('🚀'), false);
    assert.strictEqual(result.cleaned.includes('🔥'), false);
    assert.strictEqual(result.cleaned.includes('🎉'), false);
    assert.strictEqual(result.cleaned.includes('💪'), false);
    assert.strictEqual(result.cleaned.includes('💪🏽'), false); // Skin tone test
    assert.ok(result.removed.length >= 4);
  });

  await t.test('Anti-Cringe: detects and strips corporate hype terms', () => {
    const hypedText = 'We are excited to announce our revolutionary game-changer platform that will supercharge your workflow and delve into next level synergy!';
    const detected = stripCorporateHype(hypedText);

    assert.ok(detected.removed.includes('excited to announce'));
    assert.ok(detected.removed.includes('game-changer'));
    assert.ok(detected.removed.includes('supercharge'));
    assert.ok(detected.removed.includes('delve'));
    assert.ok(detected.removed.includes('revolutionary'));
    assert.ok(detected.removed.includes('next level'));
    assert.ok(detected.removed.includes('synergy'));

    assert.strictEqual(/excited to announce/i.test(detected.cleaned), false);
    assert.strictEqual(/game-changer/i.test(detected.cleaned), false);
    assert.strictEqual(/supercharge/i.test(detected.cleaned), false);
    assert.strictEqual(/delve/i.test(detected.cleaned), false);
  });

  await t.test('Anti-Cringe: strips rhetorical opening question hooks', () => {
    const withHook = 'Have you ever wondered why distributed databases randomly fail under load? Here is the architectural reason.';
    const result = stripRhetoricalHooks(withHook);

    assert.strictEqual(result.removed.length, 1);
    assert.strictEqual(result.removed[0].startsWith('Have you ever wondered'), true);
    assert.strictEqual(result.cleaned, 'Here is the architectural reason.');
  });

  await t.test('Anti-Cringe: accurately enforces character and word count budgets (150-300 words)', () => {
    const shortText = 'This is a short post with only ten words in it.';
    const underBudget = validateWordBudget(shortText, 150, 300);
    assert.strictEqual(underBudget.valid, false);
    assert.strictEqual(underBudget.status, 'under_budget');
    assert.strictEqual(underBudget.wordCount, 11);

    // Generate exactly 200 words
    const words200 = Array(200).fill('system').join(' ');
    const inBudget = validateWordBudget(words200, 150, 300);
    assert.strictEqual(inBudget.valid, true);
    assert.strictEqual(inBudget.status, 'in_budget');
    assert.strictEqual(inBudget.wordCount, 200);

    // Generate 350 words
    const words350 = Array(350).fill('latency').join(' ');
    const overBudget = validateWordBudget(words350, 150, 300);
    assert.strictEqual(overBudget.valid, false);
    assert.strictEqual(overBudget.status, 'over_budget');
    assert.strictEqual(overBudget.wordCount, 350);
  });

  await t.test('Anti-Cringe: combined filterAntiCringe handles hype, emojis, and rhetorical questions', () => {
    const messyDraft = `What if I told you there is a better way? 
We are thrilled to announce a game-changing release that will supercharge productivity! 🚀🔥
Our team has been working on low-latency memory allocators for 6 months.`;

    const filter = filterAntiCringe(messyDraft, { minWords: 5, maxWords: 50 });

    assert.strictEqual(filter.removedEmojis.length >= 2, true);
    assert.strictEqual(filter.removedHype.length >= 3, true);
    assert.strictEqual(filter.removedRhetorical.length, 1);
    assert.strictEqual(/🚀|🔥/u.test(filter.cleaned), false);
    assert.strictEqual(/thrilled to announce/i.test(filter.cleaned), false);
    assert.strictEqual(/game-changing/i.test(filter.cleaned), false);
    assert.strictEqual(/What if I told you/i.test(filter.cleaned), false);
  });

  // --------------------------------------------------------------------------
  // Group 3: Link Separation & Link Placement Policy
  // --------------------------------------------------------------------------
  await t.test('Link Separation: strips raw URLs and markdown links from post body', () => {
    const rawPostWithLinks = `Here is our new architectural breakdown. You can read the full documentation at https://company.com/docs/v2 and check out our [GitHub repo](https://github.com/company/repo) for the benchmarks. We also mirrored it at www.example.com/mirror for external testers.`;

    const { cleaned, extractedLinks } = stripLinks(rawPostWithLinks);

    assert.strictEqual(/https?:\/\//i.test(cleaned), false, 'post_body should not contain https://');
    assert.strictEqual(/www\./i.test(cleaned), false, 'post_body should not contain www.');
    assert.strictEqual(cleaned.includes('GitHub repo'), true, 'Anchor text should be preserved');
    assert.strictEqual(extractedLinks.length, 3);
    assert.ok(extractedLinks.includes('https://company.com/docs/v2'));
    assert.ok(extractedLinks.includes('https://github.com/company/repo'));
    assert.ok(extractedLinks.includes('www.example.com/mirror'));
  });

  await t.test('Link Separation: buildAttributedUrl generates correct edge redirect link', () => {
    const url = buildAttributedUrl('rodney', 'https://company.com/blog/release-v2', 'go.company.com');
    assert.strictEqual(url, 'https://go.company.com/e/rodney?url=https%3A%2F%2Fcompany.com%2Fblog%2Frelease-v2');

    const bareUrl = buildAttributedUrl('rodney', undefined, 'go.company.com');
    assert.strictEqual(bareUrl, 'https://go.company.com/e/rodney');
  });

  await t.test('Link Separation: formatFirstComment includes role context and attributed URL', () => {
    const comment = formatFirstComment('rodney', 'https://company.com/tech', 'go.company.com', 'builder');
    assert.ok(comment.includes('go.company.com/e/rodney?url='));
    assert.ok(comment.includes('Code, architecture docs, and release notes:'));
  });

  await t.test('Link Separation: formatPerspectivePost separates link and guarantees link-free post_body', () => {
    const rawDraft = `We redesigned our data cache layer. Check out https://company.com/blog/cache for the numbers. It cuts p99 by 50%. 🚀`;

    const formatted = formatPerspectivePost(rawDraft, {
      role: 'builder',
      memberSlug: 'rodney',
      redirectHost: 'go.company.com',
    });

    assert.strictEqual(formatted.role, 'builder');
    assert.strictEqual(/https?:\/\//i.test(formatted.post_body), false, 'post_body must be strictly link-free');
    assert.strictEqual(/🚀/u.test(formatted.post_body), false, 'post_body must strip rocket emoji');
    assert.ok(formatted.first_comment.includes('https://go.company.com/e/rodney?url=https%3A%2F%2Fcompany.com%2Fblog%2Fcache'));
    assert.ok(formatted.metadata.links_extracted.includes('https://company.com/blog/cache'));
    assert.ok(formatted.metadata.forbidden_emojis_removed.length > 0);
  });

  // --------------------------------------------------------------------------
  // Group 4: Prompt Generators
  // --------------------------------------------------------------------------
  await t.test('Prompt Generator: getSystemPrompt contains all anti-cringe and role definitions', () => {
    const sysPrompt = getSystemPrompt();
    assert.ok(sysPrompt.includes('ELG Perspective Engine'));
    assert.ok(sysPrompt.includes('BUILDER'));
    assert.ok(sysPrompt.includes('GTM'));
    assert.ok(sysPrompt.includes('TALENT'));
    assert.ok(sysPrompt.includes('VISIONARY'));
    assert.ok(sysPrompt.includes('PRODUCT'));
    assert.ok(sysPrompt.includes('ZERO CORPORATE HYPE'));
    assert.ok(sysPrompt.includes('ZERO FORBIDDEN EMOJIS'));
    assert.ok(sysPrompt.includes('LINK PLACEMENT POLICY'));
  });

  await t.test('Prompt Generator: generateRolePrompt compiles targeted prompts for all 5 roles', () => {
    const milestone: MilestonePayload = {
      title: 'Database Sharding Engine',
      author: 'Jane Doe',
      changelog_summary: 'Sharded write queues across 16 database partitions.',
      member_slug: 'jane',
    };

    for (const role of PERSPECTIVE_ROLES) {
      const prompt = generateRolePrompt(role, milestone);
      assert.ok(prompt.includes(`ROLE: ${role.toUpperCase()}`));
      assert.ok(prompt.includes('Database Sharding Engine'));
      assert.ok(prompt.includes('STRICT VALIDATION RULES') || prompt.includes('OUTPUT REQUIREMENTS'));
    }
  });

  await t.test('Prompt Generator: generateQuintuplePrompt includes style sample and all 5 roles', () => {
    const milestone: MilestonePayload = {
      title: 'Vector Index Pruning',
      author: 'Rodney',
      changelog_summary: 'Pruned dead leaf nodes from HNSW graphs.',
      style_sample: 'Short punchy sentences. I hate fluff. I talk about memory allocations and cache misses.',
    };

    const prompt = generateQuintuplePrompt(milestone);
    assert.ok(prompt.includes('Vector Index Pruning'));
    assert.ok(prompt.includes('Short punchy sentences. I hate fluff.'));
    assert.ok(prompt.includes('ROLES TO GENERATE'));
    assert.ok(prompt.includes('builder:'));
    assert.ok(prompt.includes('gtm:'));
    assert.ok(prompt.includes('talent:'));
    assert.ok(prompt.includes('visionary:'));
    assert.ok(prompt.includes('product:'));
  });
});
