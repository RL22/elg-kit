import type { App } from '@slack/bolt';
import { rankMessages } from './miner.js';
import { executeSemanticTask } from '../../packages/elg-engine/src/router.js';

export function registerSuggestHandler(app: App, edgeBaseUrl: string): void {
  // Manual on-demand /suggest command
  app.command('/suggest', async ({ command, ack, respond, client }) => {
    await ack();

    // Query user's recent messages across shared channels
    const history = await client.search.messages({
      query: `from:<@${command.user_id}>`,
      count: 20,
      sort: 'timestamp'
    });

    const candidateMsgs = (history.messages?.matches || []).map(m => ({
      ts: m.ts,
      channel: m.channel?.id || command.channel_id,
      text: m.text || '',
      replies: 0,
      reactions: 0
    }));

    const topRanked = rankMessages(candidateMsgs, 45).slice(0, 3);
    if (topRanked.length === 0) {
      await respond({
        text: '🔍 No high-signal technical discussions found in your recent messages this week. Keep building!',
        response_type: 'ephemeral'
      });
      return;
    }

    const topItem = topRanked[0];
    // Dispatch to Tier 2 Workhorse model for clean 150-200 word perspective drafting
    const prompt = `Convert this high-signal technical insight into an authentic 150-200 word post draft for an engineering audience. No buzzwords, no emojis, no links in post body:\n\n"${topItem.text}"`;
    const draftRes = await executeSemanticTask('workhorse', prompt);
    const postBody = draftRes.text.trim();

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🎯 *Suggested Post Draft based on your recent discussion (Signal Score: ${topItem.signalScore}/100):*\n\n${postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Attributed First Comment:*\n>${edgeBaseUrl}/e/${command.user_name}?source=suggest`
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
              value: JSON.stringify({ postBody, authorId: command.user_id })
            }
          ]
        }
      ]
    });
  });
}
