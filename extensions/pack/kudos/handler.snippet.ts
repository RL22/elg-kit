import type { App } from '@slack/bolt';
import { extractNominee, compileKudosBody } from './spotlight.js';

export function registerKudosHandler(app: App, edgeBaseUrl: string): void {
  app.command('/kudos', async ({ command, ack, respond }) => {
    await ack();

    const raw = command.text?.trim() || '';
    if (!raw) {
      await respond({
        text: '⚠️ Usage: `/kudos @colleague [what technical problem they solved]`',
        response_type: 'ephemeral'
      });
      return;
    }

    const { handle, cleanedText } = extractNominee(raw);
    const postBody = compileKudosBody({
      nomineeHandle: handle,
      nominatorHandle: command.user_name || 'teammate',
      achievementSummary: cleanedText || 'an intricate distributed concurrency issue'
    });

    const firstComment = `Celebrating @${handle}'s work. Connect with our engineering team: ${edgeBaseUrl}/e/${command.user_name}?shoutout=${handle}`;

    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `⭐ *Peer Technical Spotlight Draft:*\n\n${postBody}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*First Comment:*\n>${firstComment}`
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
              value: JSON.stringify({ postBody, firstComment, authorId: command.user_id })
            }
          ]
        }
      ]
    });
  });
}
