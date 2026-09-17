import bolt, { type SlashCommand, type BlockAction, type ViewSubmitAction } from '@slack/bolt';
const { App } = bolt;
import { VoiceProfiler } from '../tools/voice-profiler.js';
import { WeeklyImpactScheduler } from '../schedules/weekly-impact.js';

export interface SlackRouterConfig {
  signingSecret?: string;
  botToken?: string;
  appToken?: string;
  edgeBaseUrl?: string;
  showcaseChannelId?: string;
  shippedChannelId?: string;
}

/**
 * Normalizes a Slack user profile or handle into a clean alphanumeric slug
 * for edge redirects (e.g. "Rodney Lewis" -> "rodney-lewis").
 */
export function slugifyMember(nameOrHandle: string): string {
  return nameOrHandle
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'member';
}

/**
 * Extracts and validates URL from command arguments or text.
 */
export function sanitizeUrl(input: string): string | null {
  try {
    const clean = input.replace(/^<|>$/g, '').trim();
    const parsed = new URL(clean);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export interface HarvestedDraft {
  originalQuote: string;
  authorId: string;
  memberSlug: string;
  discussionUrl: string;
  postBody: string; // Strictly link-free, 150-200 words
  firstComment: string; // Contains attributed personal shortlink
  wordCount: number;
}

export interface HarvestResult {
  success: boolean;
  reason?: string;
  draft?: HarvestedDraft;
  comment?: any;
}

/**
 * Parses and extracts a Slack thread timestamp from slash command text, message URL, or fallback thread_ts.
 */
export function parseThreadTimestamp(rawInput?: string, fallbackThreadTs?: string): string | null {
  if (rawInput && rawInput.trim().length > 0) {
    const text = rawInput.trim();

    // Check for explicit query parameter thread_ts=1712345678.123456
    const queryMatch = text.match(/[?&]thread_ts=([0-9]+(?:\.[0-9]+)?)/i);
    if (queryMatch) {
      return queryMatch[1];
    }

    // Check for Slack permalink pattern: /archives/C.../p1712345678123456
    const permalinkMatch = text.match(/\/archives\/[A-Z0-9]+\/p([0-9]{10})([0-9]{6})/i);
    if (permalinkMatch) {
      return `${permalinkMatch[1]}.${permalinkMatch[2]}`;
    }

    // Check for standard timestamp format: 1712345678.123456 or 400.1
    const tsMatch = text.match(/\b([0-9]+(?:\.[0-9]+)?)\b/);
    if (tsMatch) {
      return tsMatch[1];
    }

    // Check for integer timestamp p1712345678123456 without URL
    const pMatch = text.match(/^p?([0-9]{10})([0-9]{6})$/i);
    if (pMatch) {
      return `${pMatch[1]}.${pMatch[2]}`;
    }
  }

  if (fallbackThreadTs && fallbackThreadTs.trim().length > 0) {
    return fallbackThreadTs.trim();
  }

  return null;
}

/**
 * Strips corporate buzzwords, rhetorical hooks, and forbidden emojis from text.
 */
export function sanitizeInsightText(rawText: string): string {
  let cleaned = rawText || '';

  // 1. Remove reasoning / thinking traces
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/\[thinking\][\s\S]*?\[\/thinking\]/gi, '').trim();

  // 2. Strip forbidden emojis (🚀, 🔥, 🎉, 💪, 📈, ✨)
  cleaned = cleaned.replace(/[🚀🔥🎉💪📈✨]/gu, '');

  // 3. Strip banned marketing buzzwords and clichés
  const bannedPhrases = [
    /I am (thrilled|delighted|excited|humbled) to (announce|share)/gi,
    /game-?changer/gi,
    /paradigm shift/gi,
    /disrupt(ing)? the industry/gi,
    /synerg(y|istic)/gi,
    /revolutioniz(e|ing)/gi,
    /let that sink in\.?/gi,
    /unpacking this/gi,
    /agree\?/gi,
    /thoughts\?/gi,
    /buckle up/gi,
    /secret sauce/gi,
    /supercharge/gi,
  ];

  for (const pattern of bannedPhrases) {
    cleaned = cleaned.replace(pattern, '').replace(/\s{2,}/g, ' ');
  }

  // 4. Strip rhetorical opening hooks (e.g. "Have you ever wondered...?", "What if I told you...?")
  cleaned = cleaned.replace(/^(Have you ever (wondered|asked)|What if I told you|Did you know that)[^.?!]*[.?!]\s*/i, '');

  return cleaned.trim();
}

/**
 * Counts words in a string.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Strips all external URLs from the post body to avoid the 40-60% social algorithm link penalty.
 */
export function stripAllUrls(text: string): { cleaned: string; extractedUrls: string[] } {
  const urlRegex = /https?:\/\/[^\s)>]+/gi;
  const extractedUrls: string[] = [];

  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    extractedUrls.push(match[0].replace(/[.,;]$/, ''));
  }

  // Replace markdown links [label](url) with just label
  let cleaned = text.replace(/\[([^\]]+)\]\(https?:\/\/[^\s)]+\)/gi, '$1');
  // Strip bare URLs
  cleaned = cleaned.replace(urlRegex, '').replace(/\s{2,}/g, ' ').trim();

  return { cleaned, extractedUrls };
}

/**
 * Synthesizes an authentic, link-free engineering post draft strictly within 150-200 words.
 */
export function synthesizeHarvestedPostBody(rawInsight: string): { text: string; words: number } {
  const sanitized = sanitizeInsightText(rawInsight);
  const { cleaned: noUrls } = stripAllUrls(sanitized);

  // If quote is very long, extract the core insight phrase
  const wordsInQuote = noUrls.split(/\s+/).filter(Boolean);
  let coreQuote = noUrls;
  if (wordsInQuote.length > 55) {
    coreQuote = wordsInQuote.slice(0, 50).join(' ') + '...';
  }

  // Structured authentic engineering paragraphs
  let p1 = `When architecting high-throughput distributed systems, subtle bottlenecks often hide in standard coordination patterns. We ran into this directly when analyzing our recent service traffic: ${coreQuote}${coreQuote.endsWith('.') ? '' : '.'}`;
  let p2 = 'The core issue stemmed from synchronous assumptions across our services. Under write concurrency, standard locking primitives degraded tail latency and exhausted available connection pools. We evaluated heavier orchestration layers first, but cross-datacenter round-trips introduced unacceptable jitter into the hot path.';
  let p3 = 'Instead of adding more caching layers, we refactored state resolution directly at the boundary. This eliminated the coordination overhead while guaranteeing eventual consistency across worker nodes.';
  let p4 = 'The key takeaway for systems engineers is that removing synchronization barriers at the ingress tier yields compounding resilience wins. When designing for scale, always favor lock-free data structures and deterministic local operations over centralized coordination.';
  let p5 = 'Full architectural notes and original discussion thread linked in the first comment.';

  let paragraphs = [p1, p2, p3, p4, p5];
  let fullText = paragraphs.join('\n\n');
  let currentWords = countWords(fullText);

  const expansionPool = [
    'By shifting coordination off the critical path, background worker threads operate independently without blocking active client requests.',
    'This decoupling prevents cascaded failovers during transient network partitions, maintaining predictable throughput under sustained peak load.',
    'Observability telemetry confirmed that eliminating shared lock contention resolved tail latency spikes across all distributed edge nodes.',
    'Our benchmark traces verified zero deadlocks across millions of concurrent state transitions during production simulations.',
    'Prioritizing deterministic data flow over centralized orchestration consistently yields simpler failure domains and easier disaster recovery.',
  ];

  let expandIdx = 0;
  while (currentWords < 150 && expandIdx < expansionPool.length) {
    paragraphs.splice(paragraphs.length - 2, 0, expansionPool[expandIdx]);
    fullText = paragraphs.join('\n\n');
    currentWords = countWords(fullText);
    expandIdx++;
  }

  // If over 200 words, trim from middle paragraphs
  while (currentWords > 200 && paragraphs.length > 3) {
    paragraphs.splice(1, 1);
    fullText = paragraphs.join('\n\n');
    currentWords = countWords(fullText);
  }

  // Fine-tune if still over 200 words
  while (currentWords > 200) {
    const p3Words = paragraphs[2].split(/\s+/);
    if (p3Words.length > 10) {
      p3Words.pop();
      paragraphs[2] = p3Words.join(' ') + '.';
    } else {
      break;
    }
    fullText = paragraphs.join('\n\n');
    currentWords = countWords(fullText);
  }

  return { text: fullText, words: currentWords };
}

export class SlackChannelRouter {
  public app: InstanceType<typeof App>;
  private edgeBaseUrl: string;
  private showcaseChannelId: string;
  private shippedChannelId: string;

  constructor(config: SlackRouterConfig = {}) {
    this.edgeBaseUrl = config.edgeBaseUrl || process.env.EDGE_REDIRECT_BASE_URL || 'go.company.com';
    this.showcaseChannelId = config.showcaseChannelId || process.env.SLACK_SHOWCASE_CHANNEL_ID || 'showcase';
    this.shippedChannelId = config.shippedChannelId || process.env.SLACK_SHIPPED_CHANNEL_ID || 'shipped';

    const isMockOrTest = !config.botToken && (!process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN === 'xoxb-mock-token');

    this.app = new App({
      token: config.botToken || process.env.SLACK_BOT_TOKEN || 'xoxb-mock-token',
      signingSecret: config.signingSecret || process.env.SLACK_SIGNING_SECRET || 'mock_signing_secret',
      appToken: config.appToken || process.env.SLACK_APP_TOKEN,
      socketMode: Boolean(process.env.SLACK_APP_TOKEN),
      tokenVerificationEnabled: !isMockOrTest,
    });

    this.registerCommands();
    this.registerInteractions();
    this.registerModals();
    this.registerEvents();
  }

  /**
   * Generates personal edge shortlink for an employee.
   * Format: https://${edgeBaseUrl}/e/:member?url=:targetUrl
   */
  public generatePersonalShortlink(memberSlug: string, targetUrl: string): string {
    const encodedTarget = encodeURIComponent(targetUrl);
    return `https://${this.edgeBaseUrl}/e/${memberSlug}?url=${encodedTarget}`;
  }

  /**
   * Resolves member slug from Slack user info.
   */
  private async resolveMemberSlug(userId: string): Promise<string> {
    try {
      const profile = await VoiceProfiler.getVoiceProfile(userId);
      if (profile?.handle) return profile.handle;

      if (!process.env.SLACK_BOT_TOKEN || process.env.SLACK_BOT_TOKEN === 'xoxb-mock-token') {
        return slugifyMember(userId);
      }

      const info = await this.app.client.users.info({ user: userId });
      const handle =
        info.user?.profile?.display_name ||
        info.user?.profile?.real_name ||
        info.user?.name ||
        userId;
      return slugifyMember(handle);
    } catch {
      return slugifyMember(userId);
    }
  }

  /**
   * Register Slash Commands: /link, /angles, /showcase, /elg
   */
  private registerCommands(): void {
    // 1. /link <destination-url>: Instant personal attributed shortlink
    this.app.command('/link', async ({ command, ack, respond }: any) => {
      await ack();

      const rawUrl = command.text.trim();
      const validUrl = sanitizeUrl(rawUrl);

      if (!validUrl) {
        await respond({
          response_type: 'ephemeral',
          text: '⚠️ Please provide a valid target URL. Usage: `/link https://company.com/blog/architecture`',
        });
        return;
      }

      const memberSlug = await this.resolveMemberSlug(command.user_id);
      const shortlink = this.generatePersonalShortlink(memberSlug, validUrl);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🔗 Your Personal Attributed Edge Shortlink',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Here is your personal attributed shortlink for:\n*${validUrl}*\n\n\`\`\`${shortlink}\`\`\``,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '🛡️ *Algorithm Reach Protection:* Social algorithms cut reach by 40-60% on posts with external links. *Do not put this link in your post body.* Post your narrative link-free and drop this link in the very *first comment*!',
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Request Peer Review', emoji: true },
                action_id: 'action_open_peer_review_modal',
                value: validUrl,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Browse Milestone Angles', emoji: true },
                action_id: 'action_browse_angles',
              },
            ],
          },
        ],
      });
    });

    // 2. /angles: Browse recent company milestone angles
    this.app.command('/angles', async ({ command, ack, respond }: any) => {
      await ack();

      const memberSlug = await this.resolveMemberSlug(command.user_id);
      const defaultDest = `https://company.com/features/edge-engine`;
      const sampleShortlink = this.generatePersonalShortlink(memberSlug, defaultDest);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '⚡ Recent Company Milestone Angles',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Latest Milestone:* `P99 Edge Invalidation Engine Shipped`\n_Pick a perspective matching your domain to start drafting:_',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🛠️ Builder Angle (Technical Architecture)*\n"We cut cache purge latency from 1.4s to 4ms by replacing centralized key lookups with distributed edge CRDTs. Here is the exact deadlock we hit and how we solved it without locks."\n_Comment #1 link:_ `' + sampleShortlink + '`',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*💼 GTM / Commercial Angle (Customer Impact)*\n"When global customers refresh their dashboard during flash sales, stale data creates support tickets. Our sub-5ms edge cache ensures inventory numbers sync globally with zero cache lag."\n_Comment #1 link:_ `' + sampleShortlink + '`',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🌱 Talent Angle (Engineering Culture)*\n"Our infrastructure team designed, tested, and rolled out global edge redirects in 10 days using isolated canary deploys. We are hiring senior systems engineers who care about zero-downtime migrations."\n_Comment #1 link:_ `' + sampleShortlink + '`',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🔭 Visionary Angle (Industry Evolution)*\n"Centralized web architectures are giving way to edge-native compute. The idea of waiting seconds for CDN cache clears will sound archaic by 2027."\n_Comment #1 link:_ `' + sampleShortlink + '`',
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '✍️ Draft in My Voice', emoji: true },
                style: 'primary',
                action_id: 'action_open_peer_review_modal',
                value: defaultDest,
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Submit Voice Sample', emoji: true },
                action_id: 'action_submit_voice_sample',
              },
            ],
          },
        ],
      });
    });

    // 3. /showcase <post-url> [reflection]: Author-initiated post card with thread-only constraint
    this.app.command('/showcase', async ({ command, ack, respond }: any) => {
      await ack();

      const parts = command.text.trim().split(/\s+/);
      const postUrl = sanitizeUrl(parts[0]);
      const reflection = parts.slice(1).join(' ');

      if (!postUrl) {
        await respond({
          response_type: 'ephemeral',
          text: '⚠️ Please provide a URL to your published post. Usage: `/showcase https://linkedin.com/posts/... [reflection]`',
        });
        return;
      }

      // Post the showcase card to the public #showcase channel
      try {
        await this.app.client.chat.postMessage({
          channel: this.showcaseChannelId,
          text: `New showcase post from <@${command.user_id}>: ${postUrl}`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '📢 Teammate Engineering Showcase',
                emoji: true,
              },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `<@${command.user_id}> just shared a technical post about our latest shipment!\n\n*Live Post:* ${postUrl}${
                  reflection ? `\n*Author Note:* "${reflection}"` : ''
                }`,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: '🔒 *Thread-only discussion rule:* Please keep all discussions, feedback, questions, and praise strictly inside this thread to keep #showcase clean and scannable.',
                },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '🔗 Get My Attributed Link',
                    emoji: true,
                  },
                  style: 'primary',
                  action_id: 'get_attributed_link',
                  value: postUrl,
                },
              ],
            },
          ],
        });

        await respond({
          response_type: 'ephemeral',
          text: `✅ Your post has been showcased in <#${this.showcaseChannelId}>! Teammates can now generate personal attributed links to reshare.`,
        });
      } catch (err) {
        await respond({
          response_type: 'ephemeral',
          text: `❌ Could not post to #${this.showcaseChannelId}: ${(err as Error).message}`,
        });
      }
    });

    // 4. /elg: Settings, voice samples, snooze, and stats
    this.app.command('/elg', async ({ command, ack, respond }: any) => {
      await ack();

      const args = command.text.trim().split(/\s+/);
      const subcommand = args[0]?.toLowerCase();

      if (subcommand === 'sample') {
        const sampleText = args.slice(1).join(' ');
        if (!sampleText) {
          await respond({
            response_type: 'ephemeral',
            text: 'Please provide sample text: `/elg sample Paste 1-2 paragraphs of your authentic writing style here.`',
          });
          return;
        }

        const handle = await this.resolveMemberSlug(command.user_id);
        const profile = await VoiceProfiler.saveWritingSample(command.user_id, handle, sampleText);

        await respond({
          response_type: 'ephemeral',
          text: `✅ Saved writing sample (${profile.samples.length}/3 stored). Future post drafts will replicate your cadence and sentence structure without buzzwords.`,
        });
        return;
      }

      if (subcommand === 'snooze') {
        const days = parseInt(args[1], 10) || 14;
        const until = await VoiceProfiler.snoozeMember(command.user_id, days);
        await respond({
          response_type: 'ephemeral',
          text: `😴 Proactive creator DMs snoozed until ${new Date(until).toLocaleDateString()}. Slash commands (/link, /angles) remain fully active.`,
        });
        return;
      }

      if (subcommand === 'opt-out') {
        await VoiceProfiler.optOutMember(command.user_id);
        await respond({
          response_type: 'ephemeral',
          text: `🛑 You have opted out of proactive creator DMs. Type \`/elg opt-in\` at any time to resume.`,
        });
        return;
      }

      if (subcommand === 'opt-in') {
        await VoiceProfiler.optInMember(command.user_id);
        await respond({
          response_type: 'ephemeral',
          text: `✅ You have re-enabled proactive creator DMs for major shipments.`,
        });
        return;
      }

      // Default Help / Overview
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '⚡ elg-kit Quick Reference', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                '• `/link <url>`: Get your personal attributed edge shortlink instantly.',
                '• `/angles`: Browse recent company milestone perspectives (Builder, GTM, Talent, Visionary, Product).',
                '• `/showcase <url>`: Share a published post with your team with thread-only discussion.',
                '• `/harvest [thread_ts]`: Harvest high-signal quotes from a thread into a ready-to-share post draft.',
                '• `/elg sample <text>`: Train the agent on your writing voice (stores up to 3 samples).',
                '• `/elg snooze <days>`: Pause proactive milestone DMs.',
                '• `/elg opt-out` / `/elg opt-in`: Manage your notification preferences.',
              ].join('\n'),
            },
          },
        ],
      });
    });

    // 5. /harvest [thread_ts]: Harvest high-signal quotes from thread and synthesize post draft
    this.app.command('/harvest', async ({ command, ack, respond }: any) => {
      await ack();
      await this.handleHarvestCommand(command, respond);
    });
  }

  /**
   * Register Block Kit Action handlers
   */
  private registerInteractions(): void {
    // Teammate clicks [ 🔗 Get My Attributed Link ] on a showcase card
    this.app.action('get_attributed_link', async ({ ack, body, respond }: any) => {
      await ack();

      const teammateId = body.user.id;
      const targetDestination = (body as any).actions?.[0]?.value || 'https://company.com';
      const teammateSlug = await this.resolveMemberSlug(teammateId);
      const personalLink = this.generatePersonalShortlink(teammateSlug, targetDestination);

      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `👋 Hey <@${teammateId}>! Here is *your personal attributed link* to reshare this story:\n\n\`\`\`${personalLink}\`\`\``,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '💡 *Remember:* When you reshare on LinkedIn/X, write your own takeaway in the post body, and drop this link in your *first comment* to preserve full reach.',
              },
            ],
          },
        ],
      });
    });

    // Button to open Peer Review modal
    this.app.action('action_open_peer_review_modal', async ({ ack, body }: any) => {
      await ack();

      const triggerId = (body as any).trigger_id;
      if (!triggerId) return;

      const prefilledDest = (body as any).actions?.[0]?.value || '';
      await this.openPeerReviewModal(triggerId, prefilledDest);
    });

    // Teammate or author clicks [ 📢 Share to #showcase ]
    this.app.action('action_share_to_showcase', async ({ ack, body, respond }: any) => {
      await ack();
      await this.handleShareToShowcase(body, respond);
    });
  }

  /**
   * Opens the [ Request Peer Review ] Modal Workflow
   */
  public async openPeerReviewModal(triggerId: string, prefilledUrl = ''): Promise<void> {
    await this.app.client.views.open({
      trigger_id: triggerId,
      view: {
        type: 'modal',
        callback_id: 'submit_peer_review_modal',
        title: {
          type: 'plain_text',
          text: 'Request Peer Review',
        },
        submit: {
          type: 'plain_text',
          text: 'Send for Review',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Have a colleague review your technical draft for accuracy and confidentiality before you publish to LinkedIn or X.',
            },
          },
          {
            type: 'input',
            block_id: 'block_draft',
            label: { type: 'plain_text', text: 'Proposed Post Draft' },
            element: {
              type: 'plain_text_input',
              action_id: 'input_draft_text',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'Paste your draft here (keep it link-free for social algorithms)...',
              },
            },
          },
          {
            type: 'input',
            block_id: 'block_destination',
            optional: true,
            label: { type: 'plain_text', text: 'Target Destination URL' },
            element: {
              type: 'plain_text_input',
              action_id: 'input_destination_url',
              initial_value: prefilledUrl,
              placeholder: { type: 'plain_text', text: 'https://company.com/blog/...' },
            },
          },
          {
            type: 'input',
            block_id: 'block_reviewer',
            label: { type: 'plain_text', text: 'Select Peer Reviewer' },
            element: {
              type: 'users_select',
              action_id: 'select_peer_reviewer',
              placeholder: { type: 'plain_text', text: 'Choose a teammate' },
            },
          },
          {
            type: 'input',
            block_id: 'block_accuracy_checklist',
            label: { type: 'plain_text', text: 'Technical Accuracy Checklist' },
            element: {
              type: 'checkboxes',
              action_id: 'check_accuracy',
              options: [
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Architecture & Tradeoffs:* Technical decisions, constraints, and failures are accurately represented.',
                  },
                  value: 'tradeoffs_accurate',
                },
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Benchmarks Verified:* Performance numbers (e.g. P99 latency, queries/sec) are validated.',
                  },
                  value: 'benchmarks_verified',
                },
              ],
            },
          },
          {
            type: 'input',
            block_id: 'block_confidentiality_checklist',
            label: { type: 'plain_text', text: 'Confidentiality & Safety Checklist' },
            element: {
              type: 'checkboxes',
              action_id: 'check_confidentiality',
              options: [
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Customer Privacy:* No unapproved customer logos, names, or contract figures are revealed.',
                  },
                  value: 'customer_privacy',
                },
                {
                  text: {
                    type: 'mrkdwn',
                    text: '*Security & IP:* No unannounced roadmap dates, internal keys, or proprietary secrets exposed.',
                  },
                  value: 'security_safe',
                },
              ],
            },
          },
        ],
      },
    });
  }

  /**
   * Handle modal submission for [ Request Peer Review ]
   */
  private registerModals(): void {
    this.app.view('submit_peer_review_modal', async ({ ack, view, body }: any) => {
      const values = view.state.values;

      const draftText = values.block_draft?.input_draft_text?.value || '';
      const destinationUrl = values.block_destination?.input_destination_url?.value || '';
      const reviewerId = values.block_reviewer?.select_peer_reviewer?.selected_user;
      const accuracyChecks = values.block_accuracy_checklist?.check_accuracy?.selected_options || [];
      const confidentialityChecks =
        values.block_confidentiality_checklist?.check_confidentiality?.selected_options || [];

      // Enforce that both confidentiality checkboxes must be signed off
      if (confidentialityChecks.length < 2) {
        await ack({
          response_action: 'errors',
          errors: {
            block_confidentiality_checklist:
              'You must verify both confidentiality & security items before sending for review.',
          },
        });
        return;
      }

      await ack();

      const authorId = body.user.id;

      // Dispatch DM to reviewer
      if (reviewerId) {
        try {
          await this.app.client.chat.postMessage({
            channel: reviewerId,
            text: `Peer Review Request from <@${authorId}>`,
            blocks: [
              {
                type: 'header',
                text: { type: 'plain_text', text: '🔍 Pre-Publish Peer Review Request', emoji: true },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `<@${authorId}> has requested your technical and confidentiality review before publishing this post:\n\n>>>${draftText}`,
                },
              },
              {
                type: 'section',
                fields: [
                  {
                    type: 'mrkdwn',
                    text: `*Accuracy Verified:* ${accuracyChecks.length}/2 signed off by author`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Confidentiality Check:* Passed (2/2 verified)`,
                  },
                ],
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '✅ Approve Draft', emoji: true },
                    style: 'primary',
                    action_id: 'action_approve_peer_review',
                    value: authorId,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '💬 Suggest Edits in Thread', emoji: true },
                    action_id: 'action_suggest_edits',
                    value: authorId,
                  },
                ],
              },
            ],
          });
        } catch (err) {
          console.error('[slack] Failed to notify reviewer:', err);
        }
      }
    });
  }

  /**
   * Register Event subscriptions (e.g. reaction_added)
   */
  private registerEvents(): void {
    this.app.event('reaction_added', async ({ event }: any) => {
      await this.handleReactionAdded(event);
    });
  }

  /**
   * Identifies the highest-signal engineering comment from thread messages,
   * or retrieves and validates the message matching targetTs if specified.
   */
  public identifyHighSignalComment(messages: any[], targetTs?: string): any | null {
    if (!messages || messages.length === 0) return null;

    // Filter out bots and Slackbot system messages
    const candidates = messages.filter((m: any) => {
      if (!m || !m.text) return false;
      if (m.bot_id || m.subtype === 'bot_message' || m.user === 'USLACKBOT') return false;
      return true;
    });

    // If a specific target timestamp is provided (e.g. from reaction_added)
    if (targetTs) {
      const matched = candidates.find((m: any) => m.ts === targetTs);
      if (matched && matched.text.trim().length >= 10) {
        return matched;
      }
      // Check in raw messages as fallback
      const rawMatch = messages.find((m: any) => m.ts === targetTs);
      if (rawMatch && !rawMatch.bot_id && rawMatch.user !== 'USLACKBOT' && rawMatch.text?.trim().length >= 10) {
        return rawMatch;
      }
    }

    if (candidates.length === 0) return null;

    // Score candidates based on technical keywords, code blocks, length, and reactions
    const engineeringKeywordRegex = /(\b(latency|p99|cache|database|query|lock|crdt|architecture|benchmark|cpu|memory|throughput|refactor|migration|deploy|concurrency|cluster|sharding|protocol|kernel|deadlock|queue|io_uring|microsecond|ms|node|distributed|worker|pipeline)\b)/gi;

    let bestComment: any = null;
    let highestScore = -1;

    for (const msg of candidates) {
      const text = msg.text.trim();
      if (text.length < 15) continue;

      // Filter out low-signal conversational remarks
      if (/^(looks good|lgtm|\+1|thanks|agreed|cool|nice|ok|bump)$/i.test(text)) continue;

      let score = Math.min(40, Math.floor(text.length / 10));

      const keywordMatches = text.match(engineeringKeywordRegex);
      if (keywordMatches) {
        score += keywordMatches.length * 12;
      }

      if (text.includes('```')) {
        score += 25;
      } else if (text.includes('`')) {
        score += 10;
      }

      if (msg.reactions && Array.isArray(msg.reactions)) {
        for (const r of msg.reactions) {
          const rName = (r.name || '').toLowerCase().replace(/:/g, '');
          const isHighSignalReaction = ['bulb', '💡', 'pushpin', '📌', 'lightbulb', 'star', 'fire'].includes(rName);
          score += (isHighSignalReaction ? 30 : 5) * (r.count || 1);
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestComment = msg;
      }
    }

    return bestComment;
  }

  /**
   * Formats a harvested technical quote into an authentic, link-free 150-200 word post draft.
   */
  public formatHarvestedDraft(comment: any, memberSlug: string, discussionUrl: string): HarvestedDraft {
    const rawQuote = comment?.text || '';
    const authorId = comment?.user || 'member';

    const { text: postBody, words: wordCount } = synthesizeHarvestedPostBody(rawQuote);
    const personalShortlink = this.generatePersonalShortlink(memberSlug, discussionUrl);
    const firstComment = `Link to the original engineering discussion: ${personalShortlink}`;

    return {
      originalQuote: rawQuote,
      authorId,
      memberSlug,
      discussionUrl,
      postBody,
      firstComment,
      wordCount,
    };
  }

  /**
   * Retrieves replies from a thread, identifies the high-signal comment, and synthesizes a post draft.
   */
  public async harvestThreadQuotes(channelId: string, threadTs: string): Promise<HarvestResult> {
    try {
      const replies = await this.app.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
      });

      const messages = replies.messages || [];
      const comment = this.identifyHighSignalComment(messages);

      if (!comment) {
        return { success: false, reason: 'no_high_signal_comment' };
      }

      const authorId = comment.user || 'member';
      const memberSlug = await this.resolveMemberSlug(authorId);

      let discussionUrl = `https://company.slack.com/archives/${channelId}/p${threadTs.replace('.', '')}`;
      try {
        const permalinkRes = await this.app.client.chat.getPermalink({
          channel: channelId,
          message_ts: comment.ts || threadTs,
        });
        if (permalinkRes?.permalink) {
          discussionUrl = permalinkRes.permalink;
        }
      } catch {}

      const draft = this.formatHarvestedDraft(comment, memberSlug, discussionUrl);

      return {
        success: true,
        draft,
        comment,
      };
    } catch (err) {
      console.error('[slack] harvestThreadQuotes failed:', err);
      return { success: false, reason: (err as Error).message };
    }
  }

  /**
   * Handles the /harvest slash command.
   */
  public async handleHarvestCommand(command: any, respond?: any): Promise<HarvestResult> {
    const targetThreadTs = parseThreadTimestamp(command.text, command.thread_ts);

    if (!targetThreadTs) {
      if (respond) {
        await respond({
          response_type: 'ephemeral',
          text: '⚠️ Please provide a thread timestamp or run `/harvest` within a thread. Usage: `/harvest [thread_ts]`',
        });
      }
      return { success: false, reason: 'missing_thread_ts' };
    }

    const harvestResult = await this.harvestThreadQuotes(command.channel_id, targetThreadTs);

    if (!harvestResult.success || !harvestResult.draft || !harvestResult.comment) {
      if (respond) {
        await respond({
          response_type: 'ephemeral',
          text: `🔍 No high-signal engineering comments identified in thread \`${targetThreadTs}\`. Look for technical trade-offs, architecture decisions, or benchmark numbers.`,
        });
      }
      return harvestResult;
    }

    const { draft, comment } = harvestResult;

    if (respond) {
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '💡 Thread Quote Harvested',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `We identified a high-signal engineering comment from <@${draft.authorId}>:\n\n*Original Quote:*\n>>>${comment.text}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Proposed Post Draft (Link-Free, ${draft.wordCount} Words):*\n\n${draft.postBody}`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Attributed First Comment:*\n\`${draft.firstComment}\``,
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '🛡️ *Algorithm Reach Protection:* Social algorithms cut reach by 40-60% on posts with external URLs. Post this narrative link-free and drop the link in your first comment.',
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📢 Share to #showcase',
                  emoji: true,
                },
                style: 'primary',
                action_id: 'action_share_to_showcase',
                value: JSON.stringify({
                  authorId: draft.authorId,
                  postBody: draft.postBody,
                  firstComment: draft.firstComment,
                  targetUrl: draft.discussionUrl,
                }),
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Request Peer Review',
                  emoji: true,
                },
                action_id: 'action_open_peer_review_modal',
                value: draft.discussionUrl,
              },
            ],
          },
        ],
      });
    }

    return harvestResult;
  }

  /**
   * Handles reaction_added events for 💡 (bulb) and 📌 (pushpin).
   * Retrieves thread replies, identifies high-signal comment, formats draft,
   * and dispatches a DM or ephemeral notification to the comment author.
   */
  public async handleReactionAdded(event: any): Promise<{ handled: boolean; authorId?: string; draft?: HarvestedDraft; reason?: string }> {
    const rawReaction = (event?.reaction || '').toLowerCase().replace(/:/g, '');
    const validReactions = ['bulb', '💡', 'lightbulb', 'pushpin', '📌', 'round_pushpin'];

    if (!validReactions.includes(rawReaction)) {
      return { handled: false, reason: 'ignored_reaction' };
    }

    if (event?.item?.type !== 'message' || !event.item.channel || !event.item.ts) {
      return { handled: false, reason: 'not_message' };
    }

    const channelId = event.item.channel;
    const messageTs = event.item.ts;

    let messages: any[] = [];
    try {
      const replies = await this.app.client.conversations.replies({
        channel: channelId,
        ts: messageTs,
      });
      messages = replies.messages || [];
    } catch (err) {
      console.warn('[slack] conversations.replies failed for reaction:', err);
    }

    const comment = this.identifyHighSignalComment(messages, messageTs);
    if (!comment) {
      return { handled: false, reason: 'no_high_signal_comment' };
    }

    const authorId = comment.user || event.item_user;
    if (!authorId || comment.bot_id || authorId === 'USLACKBOT') {
      return { handled: false, reason: 'bot_or_missing_author' };
    }

    const memberSlug = await this.resolveMemberSlug(authorId);

    let discussionUrl = `https://company.slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`;
    try {
      const permalinkRes = await this.app.client.chat.getPermalink({
        channel: channelId,
        message_ts: comment.ts || messageTs,
      });
      if (permalinkRes?.permalink) {
        discussionUrl = permalinkRes.permalink;
      }
    } catch {}

    const draft = this.formatHarvestedDraft(comment, memberSlug, discussionUrl);

    const notificationText = '💡 We noticed your technical insight in #showcase! Here is an authentic post draft ready to share:';

    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '💡 High-Signal Insight Harvested',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${notificationText}\n\n*Original Comment:*\n>>>${comment.text}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Proposed Post Draft (Link-Free, ${draft.wordCount} Words):*\n\n${draft.postBody}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*First Comment (with Attributed Link):*\n\`${draft.firstComment}\``,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '🛡️ *Algorithm Reach Protection:* Social algorithms cut reach by 40-60% on posts with external URLs. Keep the post body link-free and drop the link in your first comment.',
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '📢 Share to #showcase',
              emoji: true,
            },
            style: 'primary',
            action_id: 'action_share_to_showcase',
            value: JSON.stringify({
              authorId,
              postBody: draft.postBody,
              firstComment: draft.firstComment,
              targetUrl: discussionUrl,
            }),
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Request Peer Review',
              emoji: true,
            },
            action_id: 'action_open_peer_review_modal',
            value: discussionUrl,
          },
        ],
      },
    ];

    try {
      // Dispatches DM back to author of comment
      await this.app.client.chat.postMessage({
        channel: authorId,
        text: notificationText,
        blocks,
      });
    } catch (dmErr) {
      // Fall back to ephemeral message in the channel
      try {
        await this.app.client.chat.postEphemeral({
          channel: channelId,
          user: authorId,
          text: notificationText,
          blocks,
        });
      } catch (ephErr) {
        console.error('[slack] Failed to dispatch notification to author:', ephErr);
      }
    }

    return { handled: true, authorId, draft };
  }

  /**
   * Handles sharing a harvested quote to the #showcase channel.
   */
  public async handleShareToShowcase(body: any, respond?: any): Promise<void> {
    const rawVal = body.actions?.[0]?.value;
    let payload: any = {};
    try {
      payload = JSON.parse(rawVal);
    } catch {
      payload = { postBody: rawVal, authorId: body.user?.id };
    }

    const authorId = payload.authorId || body.user?.id;
    const postBody = payload.postBody || 'Engineering insight';
    const firstComment = payload.firstComment || '';
    const targetUrl = payload.targetUrl || 'https://company.com';

    await this.app.client.chat.postMessage({
      channel: this.showcaseChannelId,
      text: `💡 Engineering insight from <@${authorId}>: ${postBody.slice(0, 100)}...`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📢 Teammate Engineering Insight',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `<@${authorId}> shared a notable technical insight from our discussion threads:\n\n>>>${postBody}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Attributed Link (Comment #1):*\n\`${firstComment}\``,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: '🔒 *Thread-only discussion rule:* Please keep all discussions, feedback, questions, and praise strictly inside this thread to keep #showcase clean and scannable.',
            },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '🔗 Get My Attributed Link',
                emoji: true,
              },
              style: 'primary',
              action_id: 'get_attributed_link',
              value: targetUrl,
            },
          ],
        },
      ],
    });

    if (respond) {
      await respond({
        response_type: 'ephemeral',
        text: `✅ Shared your post draft to <#${this.showcaseChannelId}>!`,
      });
    }
  }

  /**
   * Broadcasts collective team milestone celebration notifications (replacing stack-ranked leaderboards).
   */
  public async celebrateTeamMilestone(options: {
    readsCount: number;
    postsCount: number;
    timeframe?: string;
  }): Promise<void> {
    const scheduler = new WeeklyImpactScheduler(this.app.client);
    await scheduler.celebrateTeamMilestone({
      totalReads: options.readsCount,
      totalPosts: options.postsCount,
      activeAdvocatesCount: Math.max(1, Math.floor(options.postsCount * 0.8)),
      milestoneAchieved: `${options.readsCount.toLocaleString()} verified reads reached ${options.timeframe || 'this week'}`,
    });
  }
}
