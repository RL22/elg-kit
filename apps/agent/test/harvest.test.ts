import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SlackChannelRouter,
  SlackRouterConfig,
  parseThreadTimestamp,
  sanitizeInsightText,
  countWords,
  stripAllUrls,
  synthesizeHarvestedPostBody,
} from '../agent/channels/slack.js';

function createTestRouter(config: SlackRouterConfig = {}): SlackChannelRouter {
  const router = new SlackChannelRouter(config);
  router.app.client.chat.getPermalink = (async (opts: any) => ({
    ok: true,
    permalink: `https://company.slack.com/archives/${opts.channel}/p${(opts.message_ts || '000').replace('.', '')}`,
  })) as any;
  router.app.client.chat.postMessage = (async () => ({ ok: true })) as any;
  router.app.client.chat.postEphemeral = (async () => ({ ok: true })) as any;
  router.app.client.conversations.replies = (async () => ({ ok: true, messages: [] })) as any;
  router.app.client.users.info = (async (opts: any) => ({
    ok: true,
    user: { name: opts.user, profile: { display_name: opts.user } },
  })) as any;
  return router;
}

test('Thread Quote Harvesting & Reaction Handling Test Suite', async (t) => {
  // --------------------------------------------------------------------------
  // Group 1: Timestamp Parsing Helpers
  // --------------------------------------------------------------------------
  await t.test('parseThreadTimestamp: extracts numeric timestamps from text arguments', () => {
    assert.strictEqual(parseThreadTimestamp('1712345678.123456'), '1712345678.123456');
    assert.strictEqual(parseThreadTimestamp('  1712345678.999999  '), '1712345678.999999');
  });

  await t.test('parseThreadTimestamp: extracts timestamps from Slack message permalinks', () => {
    const url = 'https://myworkspace.slack.com/archives/C01234567/p1712345678123456';
    assert.strictEqual(parseThreadTimestamp(url), '1712345678.123456');
  });

  await t.test('parseThreadTimestamp: extracts timestamps from URLs with query parameter thread_ts', () => {
    const url = 'https://myworkspace.slack.com/archives/C01234567/p1712345678000100?thread_ts=1712345678.654321&cid=C01234567';
    assert.strictEqual(parseThreadTimestamp(url), '1712345678.654321');
  });

  await t.test('parseThreadTimestamp: falls back to command.thread_ts when text is empty', () => {
    assert.strictEqual(parseThreadTimestamp('', '1712345678.111222'), '1712345678.111222');
    assert.strictEqual(parseThreadTimestamp('   ', '1712345678.333444'), '1712345678.333444');
    assert.strictEqual(parseThreadTimestamp(undefined, '1712345678.555666'), '1712345678.555666');
  });

  await t.test('parseThreadTimestamp: returns null when no timestamp or thread_ts exists', () => {
    assert.strictEqual(parseThreadTimestamp(''), null);
    assert.strictEqual(parseThreadTimestamp('not-a-timestamp'), null);
    assert.strictEqual(parseThreadTimestamp(undefined, undefined), null);
  });

  // --------------------------------------------------------------------------
  // Group 2: Sanitization and Post Synthesis
  // --------------------------------------------------------------------------
  await t.test('sanitizeInsightText: strips forbidden emojis (🚀, 🔥, 🎉, 💪, 📈, ✨)', () => {
    const text = 'Great benchmark numbers 🚀🔥! Team worked hard to celebrate 🎉 and flex 💪 with higher throughput 📈 and sparkles ✨.';
    const cleaned = sanitizeInsightText(text);
    assert.strictEqual(/[🚀🔥🎉💪📈✨]/u.test(cleaned), false);
    assert.ok(!cleaned.includes('🚀'));
    assert.ok(!cleaned.includes('🔥'));
    assert.ok(!cleaned.includes('🎉'));
    assert.ok(!cleaned.includes('💪'));
  });

  await t.test('sanitizeInsightText: strips corporate buzzwords and clichés', () => {
    const text = 'I am thrilled to announce our game-changing release! This paradigm shift will supercharge synergy and disrupt the industry.';
    const cleaned = sanitizeInsightText(text);
    assert.strictEqual(/thrilled to announce/i.test(cleaned), false);
    assert.strictEqual(/game-?changer/i.test(cleaned), false);
    assert.strictEqual(/paradigm shift/i.test(cleaned), false);
    assert.strictEqual(/supercharge/i.test(cleaned), false);
    assert.strictEqual(/synergy/i.test(cleaned), false);
  });

  await t.test('stripAllUrls: removes markdown links and bare URLs from post body', () => {
    const text = 'Check the RFC at https://company.com/rfc/crdt and benchmark code in [our repository](https://github.com/company/repo).';
    const { cleaned, extractedUrls } = stripAllUrls(text);
    assert.strictEqual(/https?:\/\//i.test(cleaned), false);
    assert.strictEqual(cleaned.includes('our repository'), true);
    assert.strictEqual(extractedUrls.length, 2);
  });

  await t.test('synthesizeHarvestedPostBody: stays under the 300-word ceiling, never pads, and is link-free', () => {
    const sampleInsights = [
      'We replaced centralized Redis locks with distributed CRDTs at the edge. Under 250k rps, P99 latency dropped from 1.4s to 4ms, eliminating cross-region lock contention.',
      'Discovered that connection pool exhaustion during database failover was caused by missing jitter on reconnects. Refactored retry policies with decorrelated exponential backoff, cutting latency spikes by 95%.',
      'Migrated our ingress proxy to io_uring ring buffers. Memory allocations dropped 40% while sustaining 1M concurrent websocket connections without packet drops.',
      'Short note: p99 latency dropped from 240ms to 12ms after indexing query planner predicates.',
      'A very comprehensive architectural reflection on distributed transactions, deadlock isolation barriers, and snapshot isolation guarantees under cross-cloud replication. '.repeat(15),
    ];

    for (const insight of sampleInsights) {
      const result = synthesizeHarvestedPostBody(insight);
      assert.ok(
        result.words > 0 && result.words <= 300,
        `Word count ${result.words} must be at most 300 words`
      );
      assert.strictEqual(result.belowTarget, result.words < 150);
      assert.strictEqual(
        result.text.includes('Observability telemetry confirmed that eliminating shared lock contention'),
        false,
        'Short drafts must not be padded with canned filler'
      );
      assert.strictEqual(
        /https?:\/\//i.test(result.text),
        false,
        'Post body must be strictly link-free'
      );
      assert.strictEqual(
        /[🚀🔥🎉💪📈✨]/u.test(result.text),
        false,
        'Post body must not contain forbidden emojis'
      );
      assert.ok(
        /first comment|comments/i.test(result.text),
        'Post body must include pointer to the comments'
      );
    }
  });

  // --------------------------------------------------------------------------
  // Group 3: High-Signal Comment Identification
  // --------------------------------------------------------------------------
  await t.test('identifyHighSignalComment: filters out bot messages and conversational fluff', () => {
    const router = createTestRouter();
    const messages = [
      { ts: '100.1', user: 'USLACKBOT', text: 'Channel created' },
      { ts: '100.2', user: 'U_BOT', bot_id: 'B123', text: 'Automated CI build finished' },
      { ts: '100.3', user: 'U_DEV1', text: 'lgtm' },
      { ts: '100.4', user: 'U_DEV2', text: '+1 looks good' },
      {
        ts: '100.5',
        user: 'U_LEAD',
        text: 'We eliminated cross-region deadlock contention by moving our state machine to distributed edge CRDTs. P99 latency dropped from 1.4s to 4ms under 250k rps.',
        reactions: [{ name: 'bulb', count: 3 }],
      },
    ];

    const comment = router.identifyHighSignalComment(messages);
    assert.ok(comment);
    assert.strictEqual(comment.ts, '100.5');
    assert.strictEqual(comment.user, 'U_LEAD');
  });

  await t.test('identifyHighSignalComment: retrieves targetTs message when reaction is placed on it', () => {
    const router = createTestRouter();
    const messages = [
      {
        ts: '200.1',
        user: 'U_DEV1',
        text: 'Initial post about our new network driver release.',
      },
      {
        ts: '200.2',
        user: 'U_ARCHITECT',
        text: 'The hardest tradeoff was handling socket descriptor teardown in io_uring without leaking UMEM memory buffers.',
      },
    ];

    const comment = router.identifyHighSignalComment(messages, '200.2');
    assert.ok(comment);
    assert.strictEqual(comment.ts, '200.2');
    assert.strictEqual(comment.user, 'U_ARCHITECT');
  });

  // --------------------------------------------------------------------------
  // Group 4: formatHarvestedDraft
  // --------------------------------------------------------------------------
  await t.test('formatHarvestedDraft: formats insight with attributed shortlink in comment #1', () => {
    const router = createTestRouter({ edgeBaseUrl: 'go.company.com' });
    const comment = {
      ts: '300.1',
      user: 'U_RODNEY',
      text: 'Replaced epoll socket polling with AF_XDP ring buffers. P99 dropped 40x under 500k rps.',
    };
    const discussionUrl = 'https://company.slack.com/archives/C123/p3001000000000000';

    const draft = router.formatHarvestedDraft(comment, 'rodney-lewis', discussionUrl);

    assert.strictEqual(draft.authorId, 'U_RODNEY');
    assert.strictEqual(draft.memberSlug, 'rodney-lewis');
    assert.ok(draft.wordCount >= 150 && draft.wordCount <= 200);
    assert.strictEqual(/https?:\/\//i.test(draft.postBody), false);
    assert.ok(draft.firstComment.includes('https://go.company.com/e/rodney-lewis?url='));
    assert.ok(draft.firstComment.includes(encodeURIComponent(discussionUrl)));
  });

  // --------------------------------------------------------------------------
  // Group 5: /harvest Slash Command Handling
  // --------------------------------------------------------------------------
  await t.test('handleHarvestCommand: requires thread timestamp when outside thread', async () => {
    const router = createTestRouter();
    let respondedText = '';
    const mockRespond = async (payload: any) => {
      respondedText = payload.text || '';
    };

    const result = await router.handleHarvestCommand(
      { text: '', thread_ts: undefined, channel_id: 'C123' },
      mockRespond
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.reason, 'missing_thread_ts');
    assert.ok(respondedText.includes('Usage: `/harvest [thread_ts]`'));
  });

  await t.test('handleHarvestCommand: harvests quotes and returns draft preview with Share button', async () => {
    const router = createTestRouter({ showcaseChannelId: 'showcase' });

    // Mock Slack WebClient replies
    router.app.client.conversations.replies = (async () => ({
      ok: true,
      messages: [
        {
          ts: '400.1',
          user: 'U_AUTHOR',
          text: 'We rewrote the cache invalidation layer using edge CRDTs. P99 dropped from 1.2s to 3ms under heavy load.',
          reactions: [{ name: '💡', count: 2 }],
        },
      ],
    })) as any;

    router.app.client.chat.getPermalink = (async () => ({
      ok: true,
      permalink: 'https://company.slack.com/archives/C123/p4001000000000000',
    })) as any;

    let responsePayload: any = null;
    const mockRespond = async (payload: any) => {
      responsePayload = payload;
    };

    const result = await router.handleHarvestCommand(
      { text: '400.1', channel_id: 'C123', user_id: 'U_CALLER' },
      mockRespond
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.draft);
    assert.ok(responsePayload);
    assert.strictEqual(responsePayload.response_type, 'ephemeral');

    // Verify blocks contain share button
    const actionsBlock = responsePayload.blocks.find((b: any) => b.type === 'actions');
    assert.ok(actionsBlock);
    const shareButton = actionsBlock.elements.find((e: any) => e.action_id === 'action_share_to_showcase');
    assert.ok(shareButton);
    assert.strictEqual(shareButton.text.text, '📢 Share to #showcase');
  });

  // --------------------------------------------------------------------------
  // Group 6: Reaction Listener for 💡 (bulb) and 📌 (pushpin)
  // --------------------------------------------------------------------------
  await t.test('handleReactionAdded: ignores unrelated reactions', async () => {
    const router = createTestRouter();
    const result = await router.handleReactionAdded({
      reaction: 'eyes',
      item: { type: 'message', channel: 'C123', ts: '500.1' },
    });
    assert.strictEqual(result.handled, false);
    assert.strictEqual(result.reason, 'ignored_reaction');
  });

  await t.test('handleReactionAdded: handles 💡 reaction and dispatches DM to author', async () => {
    const router = createTestRouter({ showcaseChannelId: 'showcase' });

    let sentChannel = '';
    let sentText = '';
    let sentBlocks: any[] = [];

    router.app.client.conversations.replies = (async () => ({
      ok: true,
      messages: [
        {
          ts: '600.1',
          user: 'U_ENGINEER',
          text: 'We refactored write serialization to avoid distributed deadlocks. Benchmarked P99 down from 800ms to 15ms.',
        },
      ],
    })) as any;

    router.app.client.chat.getPermalink = (async () => ({
      ok: true,
      permalink: 'https://company.slack.com/archives/C123/p6001000000000000',
    })) as any;

    router.app.client.chat.postMessage = (async (opts: any) => {
      sentChannel = opts.channel;
      sentText = opts.text;
      sentBlocks = opts.blocks;
      return { ok: true };
    }) as any;

    const result = await router.handleReactionAdded({
      reaction: 'bulb',
      user: 'U_REACTING_USER',
      item: { type: 'message', channel: 'C123', ts: '600.1' },
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.authorId, 'U_ENGINEER');
    assert.strictEqual(sentChannel, 'U_ENGINEER', 'DM must be sent directly to the comment author');
    assert.ok(
      sentText.includes('💡 We noticed your technical insight in #showcase! Here is an authentic post draft ready to share:'),
      'DM text must include standard notification headline'
    );

    // Verify [ 📢 Share to #showcase ] button exists in dispatched blocks
    const actions = sentBlocks.find((b: any) => b.type === 'actions');
    assert.ok(actions);
    const shareBtn = actions.elements.find((e: any) => e.action_id === 'action_share_to_showcase');
    assert.ok(shareBtn);
    assert.strictEqual(shareBtn.text.text, '📢 Share to #showcase');
  });

  await t.test('handleReactionAdded: handles 📌 (pushpin) reaction identically', async () => {
    const router = createTestRouter({ showcaseChannelId: 'showcase' });

    let dmSent = false;
    router.app.client.conversations.replies = (async () => ({
      ok: true,
      messages: [
        {
          ts: '700.1',
          user: 'U_PINNED_AUTHOR',
          text: 'Pruned dead leaf nodes from our HNSW vector index, reducing memory by 60%.',
        },
      ],
    })) as any;

    router.app.client.chat.postMessage = (async () => {
      dmSent = true;
      return { ok: true };
    }) as any;

    const result = await router.handleReactionAdded({
      reaction: 'pushpin',
      user: 'U_TEAMMATE',
      item: { type: 'message', channel: 'C123', ts: '700.1' },
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.authorId, 'U_PINNED_AUTHOR');
    assert.strictEqual(dmSent, true);
  });

  await t.test('handleReactionAdded: falls back to ephemeral post when DM fails', async () => {
    const router = createTestRouter({ showcaseChannelId: 'showcase' });

    let ephemeralPosted = false;

    router.app.client.conversations.replies = (async () => ({
      ok: true,
      messages: [
        {
          ts: '800.1',
          user: 'U_AUTHOR2',
          text: 'Benchmarked Linux io_uring zero-copy queues vs standard epoll loops.',
        },
      ],
    })) as any;

    // Fail DM post
    router.app.client.chat.postMessage = (async () => {
      throw new Error('cannot_dm_user');
    }) as any;

    // Succeed on ephemeral fallback
    router.app.client.chat.postEphemeral = (async (opts: any) => {
      ephemeralPosted = true;
      assert.strictEqual(opts.user, 'U_AUTHOR2');
      assert.ok(opts.text.includes('💡 We noticed your technical insight in #showcase!'));
      return { ok: true };
    }) as any;

    const result = await router.handleReactionAdded({
      reaction: '💡',
      user: 'U_CURATOR',
      item: { type: 'message', channel: 'C_DEV_CHANNEL', ts: '800.1' },
    });

    assert.strictEqual(result.handled, true);
    assert.strictEqual(ephemeralPosted, true);
  });

  // --------------------------------------------------------------------------
  // Group 7: handleShareToShowcase
  // --------------------------------------------------------------------------
  await t.test('handleShareToShowcase: posts formatted insight to #showcase channel', async () => {
    const router = createTestRouter({ showcaseChannelId: 'C_SHOWCASE_ID' });

    let postedChannel = '';
    let postedBlocks: any[] = [];
    let respondedEphemeral = false;

    router.app.client.chat.postMessage = (async (opts: any) => {
      postedChannel = opts.channel;
      postedBlocks = opts.blocks;
      return { ok: true };
    }) as any;

    const mockRespond = async () => {
      respondedEphemeral = true;
    };

    const payload = {
      authorId: 'U_AUTHOR_TEST',
      postBody: 'Clean link-free engineering narrative about distributed CRDTs.',
      firstComment: 'Link to RFC: https://go.company.com/e/author?url=https%3A%2F%2Fcompany.com',
      targetUrl: 'https://company.com/rfc',
    };

    await router.handleShareToShowcase(
      {
        actions: [{ value: JSON.stringify(payload) }],
        user: { id: 'U_CLICKER' },
      },
      mockRespond
    );

    assert.strictEqual(postedChannel, 'C_SHOWCASE_ID');
    assert.strictEqual(respondedEphemeral, true);

    const sectionBlock = postedBlocks.find((b: any) => b.text?.text?.includes('<@U_AUTHOR_TEST>'));
    assert.ok(sectionBlock);

    const actionBlock = postedBlocks.find((b: any) => b.type === 'actions');
    assert.ok(actionBlock);
    const getLinkBtn = actionBlock.elements.find((e: any) => e.action_id === 'get_attributed_link');
    assert.ok(getLinkBtn);
  });
});
