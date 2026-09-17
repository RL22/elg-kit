import type { App } from '@slack/bolt';
import {
  parseThreadTimestamp,
  identifyHighSignalComment,
  formatHarvestedDraft,
  sanitizeInsightText
} from '../../apps/agent/agent/channels/slack.js';

/**
 * Registers /harvest command and 💡 / 📌 reaction listeners.
 */
export function registerHarvestHandler(app: App, edgeBaseUrl: string): void {
  // Slash command handler
  app.command('/harvest', async ({ command, ack, respond, client }) => {
    await ack();
    const threadTs = parseThreadTimestamp(command.text, (command as any).thread_ts);
    if (!threadTs) {
      await respond({
        text: '⚠️ Please provide a thread timestamp or URL: `/harvest 1712345678.123456` or run within a thread.',
        response_type: 'ephemeral'
      });
      return;
    }

    const replies = await client.conversations.replies({
      channel: command.channel_id,
      ts: threadTs
    });

    const highSignalComment = identifyHighSignalComment(replies.messages || [], undefined);
    if (!highSignalComment) {
      await respond({
        text: '⚠️ No high-signal technical comments found in this thread to harvest.',
        response_type: 'ephemeral'
      });
      return;
    }

    const result = formatHarvestedDraft(highSignalComment, command.channel_id, threadTs, edgeBaseUrl);
    if (!result.success || !result.draft) {
      await respond({ text: `⚠️ Could not format draft: ${result.reason}`, response_type: 'ephemeral' });
      return;
    }

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💡 *Harvested Technical Insight (${result.draft.wordCount} words):*\n\n${result.draft.postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Attributed Link (First Comment):*\n>${result.draft.firstComment}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📢 Share to #showcase' },
              style: 'primary',
              action_id: 'action_share_to_showcase',
              value: JSON.stringify({
                postBody: result.draft.postBody,
                firstComment: result.draft.firstComment,
                authorId: result.draft.authorId
              })
            }
          ]
        }
      ]
    });
  });

  // Reaction listener for 💡 and 📌
  app.event('reaction_added', async ({ event, client }) => {
    const reaction = event.reaction;
    if (reaction !== 'bulb' && reaction !== 'pushpin' && reaction !== '💡' && reaction !== '📌') {
      return;
    }

    const channelId = event.item.channel;
    const messageTs = event.item.ts;

    const replies = await client.conversations.replies({
      channel: channelId,
      ts: messageTs
    });

    const targetComment = identifyHighSignalComment(replies.messages || [], messageTs);
    if (!targetComment || !targetComment.text) return;

    const result = formatHarvestedDraft(targetComment, channelId, messageTs, edgeBaseUrl);
    if (!result.success || !result.draft) return;

    // Send direct message to the author
    await client.chat.postMessage({
      channel: targetComment.user,
      text: '💡 We noticed your technical insight in Slack! Here is an authentic draft ready to share:',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `💡 *We noticed your technical insight!* Here is a drafted post for your approval (${result.draft.wordCount} words):\n\n${result.draft.postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Attributed First Comment:*\n>${result.draft.firstComment}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '📢 Share to #showcase' },
              style: 'primary',
              action_id: 'action_share_to_showcase',
              value: JSON.stringify({
                postBody: result.draft.postBody,
                firstComment: result.draft.firstComment,
                authorId: result.draft.authorId
              })
            }
          ]
        }
      ]
    });
  });
}
