import { App, SlashCommand, BlockAction, ViewSubmitAction } from '@slack/bolt';
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

export class SlackChannelRouter {
  public app: App;
  private edgeBaseUrl: string;
  private showcaseChannelId: string;
  private shippedChannelId: string;

  constructor(config: SlackRouterConfig = {}) {
    this.edgeBaseUrl = config.edgeBaseUrl || process.env.EDGE_REDIRECT_BASE_URL || 'go.company.com';
    this.showcaseChannelId = config.showcaseChannelId || process.env.SLACK_SHOWCASE_CHANNEL_ID || 'showcase';
    this.shippedChannelId = config.shippedChannelId || process.env.SLACK_SHIPPED_CHANNEL_ID || 'shipped';

    this.app = new App({
      token: config.botToken || process.env.SLACK_BOT_TOKEN,
      signingSecret: config.signingSecret || process.env.SLACK_SIGNING_SECRET,
      appToken: config.appToken || process.env.SLACK_APP_TOKEN,
      socketMode: Boolean(process.env.SLACK_APP_TOKEN),
    });

    this.registerCommands();
    this.registerInteractions();
    this.registerModals();
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
                '• `/elg sample <text>`: Train the agent on your writing voice (stores up to 3 samples).',
                '• `/elg snooze <days>`: Pause proactive milestone DMs.',
                '• `/elg opt-out` / `/elg opt-in`: Manage your notification preferences.',
              ].join('\n'),
            },
          },
        ],
      });
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
